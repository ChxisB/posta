defmodule MillionSend.Suppressions.Suppression do
  @moduledoc """
  A suppressed address. `origin` is `"bounce" | "complaint" | "manual" |
  "unsubscribe"`; `source_id` is the email whose bounce/complaint created the
  entry (`nil` otherwise). Batch and `remove/2` responses populate `id` plus
  `deleted`.
  """
  @type t :: %__MODULE__{}
  defstruct [:object, :id, :email, :origin, :source_id, :created_at, :deleted]
end

defmodule MillionSend.Suppressions do
  @moduledoc """
  The suppression list — addresses that are never sent to. Entries come from
  bounces, complaints and unsubscribes, or are added here. Addressable by id
  or email.

      MillionSend.Suppressions.create(%{email: "gone@acme.dev"})
      MillionSend.Suppressions.batch_add(["a@acme.dev", "b@acme.dev"], origin: :manual)
      MillionSend.Suppressions.batch_remove(%{emails: ["a@acme.dev"]})
  """

  alias MillionSend.{Client, Request}
  alias MillionSend.Suppressions.Suppression

  @doc "`POST /suppressions` — `email:` plus an optional `origin:` (default `manual`)."
  @spec create(Client.t(), map()) :: {:ok, Suppression.t()} | {:error, MillionSend.Error.t()}
  def create(client \\ MillionSend.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/suppressions", body: params, as: Suppression)
  end

  @doc "`GET /suppressions/:id_or_email`"
  @spec get(Client.t(), String.t()) :: {:ok, Suppression.t()} | {:error, MillionSend.Error.t()}
  def get(client \\ MillionSend.client(), id_or_email) when is_binary(id_or_email) do
    Request.run(client, method: :get, path: member_path(id_or_email), as: Suppression)
  end

  @doc "`GET /suppressions` — accepts `limit:`, `after:`, `before:` and `origin:`."
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
      path: "/suppressions",
      query: Request.list_query(opts) ++ [origin: opts[:origin]],
      as: {:list, Suppression}
    )
  end

  @doc "`DELETE /suppressions/:id_or_email`"
  @spec remove(Client.t(), String.t()) :: {:ok, Suppression.t()} | {:error, MillionSend.Error.t()}
  def remove(client \\ MillionSend.client(), id_or_email) when is_binary(id_or_email) do
    Request.run(client, method: :delete, path: member_path(id_or_email), as: Suppression)
  end

  @doc """
  `POST /suppressions/batch/add` — block up to 1000 addresses at once. Options:
  `origin:` (default `manual`). Returns the created entries (id only).
  """
  @spec batch_add([String.t()]) :: {:ok, [Suppression.t()]} | {:error, MillionSend.Error.t()}
  def batch_add(emails) when is_list(emails), do: batch_add(MillionSend.client(), emails, [])

  @spec batch_add(Client.t() | [String.t()], [String.t()] | keyword()) ::
          {:ok, [Suppression.t()]} | {:error, MillionSend.Error.t()}
  def batch_add(%Client{} = client, emails) when is_list(emails),
    do: batch_add(client, emails, [])

  def batch_add(emails, opts) when is_list(emails) and is_list(opts),
    do: batch_add(MillionSend.client(), emails, opts)

  @spec batch_add(Client.t(), [String.t()], keyword()) ::
          {:ok, [Suppression.t()]} | {:error, MillionSend.Error.t()}
  def batch_add(%Client{} = client, emails, opts) when is_list(emails) and is_list(opts) do
    Request.run(client,
      method: :post,
      path: "/suppressions/batch/add",
      body: opts |> Map.new() |> Map.put(:emails, emails),
      as: {:data, Suppression}
    )
  end

  @doc """
  `POST /suppressions/batch/remove` — unblock by `%{emails: [...]}` or
  `%{ids: [...]}` (up to 1000). Returns the removed entries with `deleted: true`.
  """
  @spec batch_remove(Client.t(), map()) ::
          {:ok, [Suppression.t()]} | {:error, MillionSend.Error.t()}
  def batch_remove(client \\ MillionSend.client(), params) when is_map(params) do
    Request.run(client,
      method: :post,
      path: "/suppressions/batch/remove",
      body: params,
      as: {:data, Suppression}
    )
  end

  defp member_path(id_or_email), do: "/suppressions/" <> Request.encode(id_or_email)
end
