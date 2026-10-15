defmodule Posta.Broadcasts.Broadcast do
  @moduledoc "A broadcast: an email sent to the team's contacts, optionally targeted."
  @type t :: %__MODULE__{}
  defstruct [
    :object,
    :id,
    :name,
    :segment_id,
    :status,
    :created_at,
    :scheduled_at,
    :sent_at,
    :from,
    :subject,
    :reply_to,
    :preview_text,
    :topic_id,
    :html,
    :text,
    :deleted
  ]
end

defmodule Posta.Broadcasts do
  @moduledoc """
  Broadcasts. Create a draft, then `send/3` it (optionally scheduled), or pass
  `send: true` (plus an optional `scheduled_at`) to `create/2` to do both at
  once. Target with an optional `segment_id` and/or `topic_id`; neither means
  every contact of the team.

  Input maps are sent as given: `name`, `segment_id`, `from`, `subject`, `html`,
  `text`, `reply_to`, `preview_text`, `topic_id`, and on create `send` and
  `scheduled_at`. On `update/3`, `topic_id: nil` clears the topic.

      {:ok, b} = Posta.Broadcasts.create(%{
        from: "Acme <news@acme.dev>", subject: "Launch", html: "<p>hi</p>"
      })
      Posta.Broadcasts.send(b.id, scheduled_at: "2026-09-01T09:00:00Z")
  """

  # `send/1` here is the broadcast action, not `Kernel.send/2`.
  import Kernel, except: [send: 2]

  alias Posta.{Client, Request}
  alias Posta.Broadcasts.Broadcast

  @doc "`POST /broadcasts`"
  @spec create(Client.t(), map()) :: {:ok, Broadcast.t()} | {:error, Posta.Error.t()}
  def create(client \\ Posta.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/broadcasts", body: params, as: Broadcast)
  end

  @doc "`GET /broadcasts/:id`"
  @spec get(Client.t(), String.t()) :: {:ok, Broadcast.t()} | {:error, Posta.Error.t()}
  def get(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :get, path: "/broadcasts/" <> Request.encode(id), as: Broadcast)
  end

  @doc "`GET /broadcasts`: accepts `limit:`, `after:`, `before:`."
  @spec list(Client.t() | keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(), do: list(Posta.client(), [])
  def list(%Client{} = client), do: list(client, [])
  def list(opts) when is_list(opts), do: list(Posta.client(), opts)

  @spec list(Client.t(), keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(%Client{} = client, opts) when is_list(opts) do
    Request.run(client,
      method: :get,
      path: "/broadcasts",
      query: Request.list_query(opts),
      as: {:list, Broadcast}
    )
  end

  @doc "`PATCH /broadcasts/:id`: draft only. `topic_id: nil` clears the topic."
  @spec update(Client.t(), String.t(), map()) :: {:ok, Broadcast.t()} | {:error, Posta.Error.t()}
  def update(client \\ Posta.client(), id, params) when is_binary(id) and is_map(params) do
    Request.run(client,
      method: :patch,
      path: "/broadcasts/" <> Request.encode(id),
      body: params,
      as: Broadcast
    )
  end

  @doc "`DELETE /broadcasts/:id`: draft only."
  @spec remove(Client.t(), String.t()) :: {:ok, Broadcast.t()} | {:error, Posta.Error.t()}
  def remove(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client,
      method: :delete,
      path: "/broadcasts/" <> Request.encode(id),
      as: Broadcast
    )
  end

  @doc "`POST /broadcasts/:id/send`: pass `scheduled_at:` to schedule, omit to send now."
  @spec send(String.t()) :: {:ok, Broadcast.t()} | {:error, Posta.Error.t()}
  def send(id) when is_binary(id), do: send(Posta.client(), id, [])

  @spec send(Client.t() | String.t(), String.t() | keyword()) ::
          {:ok, Broadcast.t()} | {:error, Posta.Error.t()}
  def send(%Client{} = client, id) when is_binary(id), do: send(client, id, [])

  def send(id, opts) when is_binary(id) and is_list(opts), do: send(Posta.client(), id, opts)

  @spec send(Client.t(), String.t(), keyword()) ::
          {:ok, Broadcast.t()} | {:error, Posta.Error.t()}
  def send(%Client{} = client, id, opts) when is_binary(id) and is_list(opts) do
    Request.run(client,
      method: :post,
      path: "/broadcasts/" <> Request.encode(id) <> "/send",
      body: Map.new(opts),
      as: Broadcast
    )
  end

  @doc "`POST /broadcasts/:id/cancel`: scheduled only."
  @spec cancel(Client.t(), String.t()) :: {:ok, Broadcast.t()} | {:error, Posta.Error.t()}
  def cancel(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client,
      method: :post,
      path: "/broadcasts/" <> Request.encode(id) <> "/cancel",
      as: Broadcast
    )
  end
end
