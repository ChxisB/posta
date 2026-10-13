defmodule MillionSend.ContactProperties.ContactProperty do
  @moduledoc """
  A custom contact property definition: `key`, `type` (`"string" | "number"`)
  and the `fallback_value` used when a contact has no value. `remove/2`
  populates `id` plus `deleted`.
  """
  @type t :: %__MODULE__{}
  defstruct [:object, :id, :key, :type, :fallback_value, :created_at, :deleted]
end

defmodule MillionSend.ContactProperties do
  @moduledoc """
  Contact property definitions. Input maps are sent as given: `create/2`
  accepts `key`, `type` (`:string | :number`) and `fallback_value`; `update/3`
  accepts `fallback_value` (`nil` clears it).

      MillionSend.ContactProperties.create(%{key: "plan", type: :string, fallback_value: "free"})
  """

  alias MillionSend.{Client, Request}
  alias MillionSend.ContactProperties.ContactProperty

  @doc "`POST /contact-properties` — a duplicate `key` is a 409."
  @spec create(Client.t(), map()) :: {:ok, ContactProperty.t()} | {:error, MillionSend.Error.t()}
  def create(client \\ MillionSend.client(), params) when is_map(params) do
    Request.run(client,
      method: :post,
      path: "/contact-properties",
      body: params,
      as: ContactProperty
    )
  end

  @doc "`GET /contact-properties/:id`"
  @spec get(Client.t(), String.t()) ::
          {:ok, ContactProperty.t()} | {:error, MillionSend.Error.t()}
  def get(client \\ MillionSend.client(), id) when is_binary(id) do
    Request.run(client, method: :get, path: member_path(id), as: ContactProperty)
  end

  @doc "`GET /contact-properties` — accepts `limit:`, `after:`, `before:`."
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
      path: "/contact-properties",
      query: Request.list_query(opts),
      as: {:list, ContactProperty}
    )
  end

  @doc "`PATCH /contact-properties/:id` — `fallback_value` (`nil` clears it)."
  @spec update(Client.t(), String.t(), map()) ::
          {:ok, ContactProperty.t()} | {:error, MillionSend.Error.t()}
  def update(client \\ MillionSend.client(), id, params) when is_binary(id) and is_map(params) do
    Request.run(client,
      method: :patch,
      path: member_path(id),
      body: params,
      as: ContactProperty
    )
  end

  @doc "`DELETE /contact-properties/:id`"
  @spec remove(Client.t(), String.t()) ::
          {:ok, ContactProperty.t()} | {:error, MillionSend.Error.t()}
  def remove(client \\ MillionSend.client(), id) when is_binary(id) do
    Request.run(client, method: :delete, path: member_path(id), as: ContactProperty)
  end

  defp member_path(id), do: "/contact-properties/" <> Request.encode(id)
end
