defmodule Posta.Domains.Domain.Record do
  @moduledoc """
  One DNS record to publish for a domain: `record` (the role, e.g. SPF, DKIM,
  DMARC or Tracking), `name`, `type`, `ttl`, `value`, `status` and, for MX,
  `priority`.
  """
  @type t :: %__MODULE__{}
  defstruct [:record, :name, :type, :ttl, :status, :value, :priority]
end

defmodule Posta.Domains.Domain do
  @moduledoc """
  A sending domain. `records` lists the DNS records to publish (empty on list
  and delete responses); `capabilities` is the `%{"sending" => ..., "receiving"
  => ...}` map as returned by the API.
  """
  alias Posta.Domains.Domain.Record
  alias Posta.Request

  @type t :: %__MODULE__{}
  defstruct [
    :object,
    :id,
    :name,
    :status,
    :created_at,
    :region,
    :open_tracking,
    :click_tracking,
    :tracking_subdomain,
    :capabilities,
    :deleted,
    records: []
  ]

  @doc false
  def cast(map) do
    domain = Request.cast_struct(__MODULE__, map)
    %{domain | records: Enum.map(domain.records || [], &Request.cast_struct(Record, &1))}
  end
end

defmodule Posta.Domains do
  @moduledoc """
  Sending domains: add one, publish the returned DNS `records`, then `verify/2`.

  Input maps are sent as given: `create/2` accepts `name`, `region`,
  `custom_return_path`, `open_tracking`, `click_tracking` and
  `tracking_subdomain`; `update/3` accepts `open_tracking`, `click_tracking`
  and `tracking_subdomain` (`nil` clears it).

      {:ok, domain} = Posta.Domains.create(%{name: "acme.dev"})
      domain.records  # [%Posta.Domains.Domain.Record{record: "DKIM", ...}, ...]
  """

  alias Posta.{Client, Request}
  alias Posta.Domains.Domain

  @doc "`POST /domains`"
  @spec create(Client.t(), map()) :: {:ok, Domain.t()} | {:error, Posta.Error.t()}
  def create(client \\ Posta.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/domains", body: params, as: &Domain.cast/1)
  end

  @doc "`GET /domains/:id`"
  @spec get(Client.t(), String.t()) :: {:ok, Domain.t()} | {:error, Posta.Error.t()}
  def get(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :get, path: member_path(id), as: &Domain.cast/1)
  end

  @doc "`GET /domains`: accepts `limit:`, `after:`, `before:`."
  @spec list(Client.t() | keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(), do: list(Posta.client(), [])
  def list(%Client{} = client), do: list(client, [])
  def list(opts) when is_list(opts), do: list(Posta.client(), opts)

  @spec list(Client.t(), keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(%Client{} = client, opts) when is_list(opts) do
    Request.run(client,
      method: :get,
      path: "/domains",
      query: Request.list_query(opts),
      as: {:list, Domain}
    )
  end

  @doc "`POST /domains/:id/verify`: re-check the DNS records."
  @spec verify(Client.t(), String.t()) :: {:ok, Domain.t()} | {:error, Posta.Error.t()}
  def verify(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :post, path: member_path(id) <> "/verify", as: &Domain.cast/1)
  end

  @doc "`PATCH /domains/:id`: tracking settings; `tracking_subdomain: nil` clears it."
  @spec update(Client.t(), String.t(), map()) :: {:ok, Domain.t()} | {:error, Posta.Error.t()}
  def update(client \\ Posta.client(), id, params) when is_binary(id) and is_map(params) do
    Request.run(client, method: :patch, path: member_path(id), body: params, as: &Domain.cast/1)
  end

  @doc "`DELETE /domains/:id`"
  @spec remove(Client.t(), String.t()) :: {:ok, Domain.t()} | {:error, Posta.Error.t()}
  def remove(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :delete, path: member_path(id), as: &Domain.cast/1)
  end

  defp member_path(id), do: "/domains/" <> Request.encode(id)
end
