defmodule Posta.Segments.Segment do
  @moduledoc "A dynamic segment — a saved filter over the team's contacts."
  @type t :: %__MODULE__{}
  defstruct [:object, :id, :name, :filter, :created_at, :contact_count, :deleted]
end

defmodule Posta.Segments do
  @moduledoc """
  Segments — a saved `filter` over the team's contacts (dynamic, a Posta
  extension over Resend's static segments); a segment without a filter is a
  plain list contacts are added to explicitly. `get/2` returns a live
  `contact_count`.

      Posta.Segments.create(%{
        name: "Pro plan",
        filter: %{match: :all, conditions: [%{field: "property:plan", op: "equals", value: "pro"}]}
      })
  """

  alias Posta.{Client, Contacts, Request}
  alias Posta.Contacts.Contact
  alias Posta.Segments.Segment

  @doc "`POST /segments` — `name:` plus an optional `filter:`."
  @spec create(Client.t(), map()) :: {:ok, Segment.t()} | {:error, Posta.Error.t()}
  def create(client \\ Posta.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/segments", body: params, as: Segment)
  end

  @doc "`GET /segments/:id`"
  @spec get(Client.t(), String.t()) :: {:ok, Segment.t()} | {:error, Posta.Error.t()}
  def get(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :get, path: "/segments/" <> Request.encode(id), as: Segment)
  end

  @doc "`GET /segments` — accepts `limit:`, `after:`, `before:`."
  @spec list(Client.t() | keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(), do: list(Posta.client(), [])
  def list(%Client{} = client), do: list(client, [])
  def list(opts) when is_list(opts), do: list(Posta.client(), opts)

  @spec list(Client.t(), keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(%Client{} = client, opts) when is_list(opts) do
    Request.run(client,
      method: :get,
      path: "/segments",
      query: Request.list_query(opts),
      as: {:list, Segment}
    )
  end

  @doc """
  `GET /segments/:id/contacts` — the segment's members; accepts `limit:`,
  `after:`, `before:` and `include:` (`[:properties, :topics]`, as
  `Posta.Contacts.list/2`).
  """
  @spec list_contacts(String.t()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list_contacts(id) when is_binary(id), do: list_contacts(Posta.client(), id, [])

  @spec list_contacts(Client.t() | String.t(), String.t() | keyword()) ::
          {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list_contacts(%Client{} = client, id) when is_binary(id), do: list_contacts(client, id, [])

  def list_contacts(id, opts) when is_binary(id) and is_list(opts),
    do: list_contacts(Posta.client(), id, opts)

  @spec list_contacts(Client.t(), String.t(), keyword()) ::
          {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list_contacts(%Client{} = client, id, opts) when is_binary(id) and is_list(opts) do
    Request.run(client,
      method: :get,
      path: "/segments/" <> Request.encode(id) <> "/contacts",
      query: Request.list_query(opts) ++ Contacts.include_query(opts),
      as: {:list, &Contact.cast/1}
    )
  end

  @doc "`PATCH /segments/:id`"
  @spec update(Client.t(), String.t(), map()) :: {:ok, Segment.t()} | {:error, Posta.Error.t()}
  def update(client \\ Posta.client(), id, params) when is_binary(id) and is_map(params) do
    Request.run(client,
      method: :patch,
      path: "/segments/" <> Request.encode(id),
      body: params,
      as: Segment
    )
  end

  @doc "`DELETE /segments/:id`"
  @spec remove(Client.t(), String.t()) :: {:ok, Segment.t()} | {:error, Posta.Error.t()}
  def remove(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :delete, path: "/segments/" <> Request.encode(id), as: Segment)
  end
end
