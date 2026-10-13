defmodule Posta.ApiKeys.ApiKey do
  @moduledoc """
  An API key. `token` is returned only by `create/2` — store it, it cannot be
  fetched again. `remove/2` populates `id` plus `deleted`.
  """
  @type t :: %__MODULE__{}
  defstruct [:object, :id, :name, :token, :created_at, :last_used_at, :deleted]
end

defmodule Posta.ApiKeys do
  @moduledoc """
  API keys. Input maps are sent as given: `name`, `permission`
  (`:full_access`, the default, or `:sending_access`) and `domain_id`
  (restrict a sending key to one domain).

      {:ok, key} = Posta.ApiKeys.create(%{name: "ci", permission: :sending_access})
      key.token
  """

  alias Posta.{Client, Request}
  alias Posta.ApiKeys.ApiKey

  @doc "`POST /api-keys` — the response carries the one-time `token`."
  @spec create(Client.t(), map()) :: {:ok, ApiKey.t()} | {:error, Posta.Error.t()}
  def create(client \\ Posta.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/api-keys", body: params, as: ApiKey)
  end

  @doc "`GET /api-keys` — accepts `limit:`, `after:`, `before:`."
  @spec list(Client.t() | keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(), do: list(Posta.client(), [])
  def list(%Client{} = client), do: list(client, [])
  def list(opts) when is_list(opts), do: list(Posta.client(), opts)

  @spec list(Client.t(), keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(%Client{} = client, opts) when is_list(opts) do
    Request.run(client,
      method: :get,
      path: "/api-keys",
      query: Request.list_query(opts),
      as: {:list, ApiKey}
    )
  end

  @doc "`DELETE /api-keys/:id`"
  @spec remove(Client.t(), String.t()) :: {:ok, ApiKey.t()} | {:error, Posta.Error.t()}
  def remove(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :delete, path: "/api-keys/" <> Request.encode(id), as: ApiKey)
  end
end
