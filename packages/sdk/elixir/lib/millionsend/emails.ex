defmodule MillionSend.Emails.Email do
  @moduledoc "An email. `send/2`, `update/3`, `cancel/2` and `remove/2` populate only `id`/`object` (plus `deleted`)."
  @type t :: %__MODULE__{}
  defstruct [
    :object,
    :id,
    :from,
    :to,
    :cc,
    :bcc,
    :reply_to,
    :subject,
    :html,
    :text,
    :created_at,
    :scheduled_at,
    :message_id,
    :last_event,
    :score,
    :deleted
  ]
end

defmodule MillionSend.Emails.BatchResponse do
  @moduledoc """
  The result of a permissive `MillionSend.Emails.send_batch/3`: `data` holds
  the accepted emails (id only) and `errors` the rejected items by request index.
  """
  alias MillionSend.{BatchError, Request}
  alias MillionSend.Emails.Email

  @type t :: %__MODULE__{data: [Email.t()], errors: [BatchError.t()]}
  defstruct data: [], errors: []

  @doc false
  def cast(map) do
    %__MODULE__{
      data: Enum.map(map["data"] || [], &Request.cast_struct(Email, &1)),
      errors: BatchError.cast_list(map["errors"])
    }
  end
end

defmodule MillionSend.Emails.Insights.Check do
  @moduledoc """
  One best-practice check from an insights report. `id` is an open set (the
  catalog grows across score versions), and `severity`/`status` are plain
  strings so future wire values never break decoding. `detail` is free-form
  JSON (a map) or `nil`.
  """
  @type t :: %__MODULE__{}
  defstruct [:id, :severity, :status, :penalty, :detail]
end

defmodule MillionSend.Emails.Insights do
  @moduledoc """
  The pre-send best-practice report computed when an email was sent. `score`
  is 0–10 (one decimal); `band` is a plain string
  (`"excellent" | "good" | "needs_attention" | "at_risk"`, open to future values).
  """
  @type t :: %__MODULE__{}
  defstruct [
    :object,
    :email_id,
    :score,
    :score_version,
    :band,
    :marketing,
    :html_size_bytes,
    :computed_at,
    checks: []
  ]
end

defmodule MillionSend.Emails do
  @moduledoc """
  Send, list, fetch, reschedule and cancel emails.

  Input maps use snake_case keys and are sent to the API as given — every key
  reaches the wire: `from`, `to`, `subject`, `html`, `text`, `cc`, `bcc`,
  `reply_to`, `scheduled_at`, `tags`, `topic_id`, `attachments`, `headers` and
  `template`. `:to`, `:cc`, `:bcc` and `:reply_to` take a string or a list of
  strings.

      MillionSend.Emails.send(%{
        from: "Acme <onboarding@acme.dev>",
        to: "success@simulator.amazonses.com",
        subject: "Hello",
        html: "<strong>it works</strong>",
        tags: [%{name: "campaign", value: "welcome"}],
        attachments: [%{filename: "hi.txt", content: Base.encode64("hi")}]
      })
  """

  # `send/1` here is the email action, not `Kernel.send/2`.
  import Kernel, except: [send: 2]

  alias MillionSend.{Client, Request}
  alias MillionSend.Emails.{BatchResponse, Email, Insights}

  @doc """
  `POST /emails`. Accepts an optional leading client and an optional
  `idempotency_key:` in the trailing options.
  """
  @spec send(map()) :: {:ok, Email.t()} | {:error, MillionSend.Error.t()}
  def send(params) when is_map(params), do: send(MillionSend.client(), params, [])

  @spec send(Client.t() | map(), map() | keyword()) ::
          {:ok, Email.t()} | {:error, MillionSend.Error.t()}
  def send(%Client{} = client, params) when is_map(params), do: send(client, params, [])

  def send(params, opts) when is_map(params) and is_list(opts),
    do: send(MillionSend.client(), params, opts)

  @spec send(Client.t(), map(), keyword()) :: {:ok, Email.t()} | {:error, MillionSend.Error.t()}
  def send(%Client{} = client, params, opts) when is_map(params) and is_list(opts) do
    Request.run(client,
      method: :post,
      path: "/emails",
      body: params,
      idempotency_key: opts[:idempotency_key],
      as: Email
    )
  end

  @doc """
  `POST /emails/batch` — 1..100 emails in one call. Options: `idempotency_key:`
  and `batch_validation:` (`:strict`, the default, or `:permissive`; sent as the
  `x-batch-validation` header).

  Strict mode is all-or-nothing and returns the accepted emails as a plain
  list. Permissive mode writes the valid subset and returns a
  `MillionSend.Emails.BatchResponse` whose `errors` lists the rejected items by
  request index.
  """
  @spec send_batch([map()]) :: {:ok, [Email.t()]} | {:error, MillionSend.Error.t()}
  def send_batch(list) when is_list(list), do: send_batch(MillionSend.client(), list, [])

  @spec send_batch(Client.t() | [map()], [map()] | keyword()) ::
          {:ok, [Email.t()] | BatchResponse.t()} | {:error, MillionSend.Error.t()}
  def send_batch(%Client{} = client, list) when is_list(list), do: send_batch(client, list, [])

  def send_batch(list, opts) when is_list(list) and is_list(opts),
    do: send_batch(MillionSend.client(), list, opts)

  @spec send_batch(Client.t(), [map()], keyword()) ::
          {:ok, [Email.t()] | BatchResponse.t()} | {:error, MillionSend.Error.t()}
  def send_batch(%Client{} = client, list, opts) when is_list(list) and is_list(opts) do
    mode = opts[:batch_validation]

    Request.run(client,
      method: :post,
      path: "/emails/batch",
      body: list,
      idempotency_key: opts[:idempotency_key],
      batch_validation: mode,
      as: if(to_string(mode) == "permissive", do: &BatchResponse.cast/1, else: {:data, Email})
    )
  end

  @doc "`GET /emails/:id`"
  @spec get(Client.t(), String.t()) :: {:ok, Email.t()} | {:error, MillionSend.Error.t()}
  def get(client \\ MillionSend.client(), id) when is_binary(id) do
    Request.run(client, method: :get, path: "/emails/" <> Request.encode(id), as: Email)
  end

  @doc "`GET /emails` — accepts `limit:`, `after:`, `before:`."
  @spec list(Client.t() | keyword()) ::
          {:ok, MillionSend.List.t()} | {:error, MillionSend.Error.t()}
  def list(), do: list(MillionSend.client(), [])
  def list(%Client{} = client), do: list(client, [])
  def list(opts) when is_list(opts), do: list(MillionSend.client(), opts)

  @spec list(Client.t(), keyword()) ::
          {:ok, MillionSend.List.t()} | {:error, MillionSend.Error.t()}
  def list(%Client{} = client, opts) when is_list(opts) do
    Request.run(client,
      method: :get,
      path: "/emails",
      query: Request.list_query(opts),
      as: {:list, Email}
    )
  end

  @doc """
  `PATCH /emails/:id` — reschedule a scheduled, unsent email. `params` carries
  `scheduled_at:` (a map or keyword list).
  """
  @spec update(Client.t(), String.t(), map() | keyword()) ::
          {:ok, Email.t()} | {:error, MillionSend.Error.t()}
  def update(client \\ MillionSend.client(), id, params) when is_binary(id) do
    Request.run(client,
      method: :patch,
      path: "/emails/" <> Request.encode(id),
      body: Map.new(params),
      as: Email
    )
  end

  @doc """
  `GET /emails/:id/insights` — the email's deliverability insights report.
  Returns a `"not_found"` error until insights exist for the email.
  """
  @spec get_insights(Client.t(), String.t()) ::
          {:ok, Insights.t()} | {:error, MillionSend.Error.t()}
  def get_insights(client \\ MillionSend.client(), id) when is_binary(id) do
    with {:ok, %Insights{} = insights} <-
           Request.run(client,
             method: :get,
             path: "/emails/" <> Request.encode(id) <> "/insights",
             as: Insights
           ) do
      {:ok, %{insights | checks: Enum.map(insights.checks || [], &cast_check/1)}}
    end
  end

  defp cast_check(check) when is_map(check) do
    %Insights.Check{
      id: check["id"],
      severity: check["severity"],
      status: check["status"],
      penalty: check["penalty"],
      detail: check["detail"]
    }
  end

  @doc "`POST /emails/:id/cancel` — only scheduled, unsent emails."
  @spec cancel(Client.t(), String.t()) :: {:ok, Email.t()} | {:error, MillionSend.Error.t()}
  def cancel(client \\ MillionSend.client(), id) when is_binary(id) do
    Request.run(client,
      method: :post,
      path: "/emails/" <> Request.encode(id) <> "/cancel",
      as: Email
    )
  end

  @doc "`DELETE /emails/:id`"
  @spec remove(Client.t(), String.t()) :: {:ok, Email.t()} | {:error, MillionSend.Error.t()}
  def remove(client \\ MillionSend.client(), id) when is_binary(id) do
    Request.run(client, method: :delete, path: "/emails/" <> Request.encode(id), as: Email)
  end
end
