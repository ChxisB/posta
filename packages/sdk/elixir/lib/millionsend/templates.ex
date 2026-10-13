defmodule MillionSend.Templates.Template do
  @moduledoc """
  A stored email template. Write responses populate only `id`/`object`;
  `get/2` returns the full record. `alias` is a case-sensitive handle that
  resolves in place of the id. `remove/2` populates `id` plus `deleted`.
  """
  @type t :: %__MODULE__{}
  defstruct [
    :object,
    :id,
    :name,
    :alias,
    :status,
    :published_at,
    :created_at,
    :updated_at,
    :current_version_id,
    :from,
    :subject,
    :reply_to,
    :html,
    :text,
    :variables,
    :has_unpublished_versions,
    :deleted
  ]
end

defmodule MillionSend.Templates do
  @moduledoc """
  Templates. Every member function takes the template id **or** its alias.

  Input maps are sent as given: `name`, `html`, `subject`, `text` and `alias`;
  on `update/3`, `nil` clears `subject`, `text` or `alias`. Templates are
  published on write, so `publish/2` is a no-op kept for Resend compatibility.

      {:ok, t} = MillionSend.Templates.create(%{name: "Welcome", alias: "welcome", html: "<p>Hi</p>"})
      MillionSend.Templates.get("welcome")
  """

  alias MillionSend.{Client, Request}
  alias MillionSend.Templates.Template

  @doc "`POST /templates`"
  @spec create(Client.t(), map()) :: {:ok, Template.t()} | {:error, MillionSend.Error.t()}
  def create(client \\ MillionSend.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/templates", body: params, as: Template)
  end

  @doc "`GET /templates/:id_or_alias`"
  @spec get(Client.t(), String.t()) :: {:ok, Template.t()} | {:error, MillionSend.Error.t()}
  def get(client \\ MillionSend.client(), id_or_alias) when is_binary(id_or_alias) do
    Request.run(client, method: :get, path: member_path(id_or_alias), as: Template)
  end

  @doc "`GET /templates` — accepts `limit:`, `after:`, `before:`."
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
      path: "/templates",
      query: Request.list_query(opts),
      as: {:list, Template}
    )
  end

  @doc "`PATCH /templates/:id_or_alias` — `nil` clears `subject`, `text` or `alias`."
  @spec update(Client.t(), String.t(), map()) ::
          {:ok, Template.t()} | {:error, MillionSend.Error.t()}
  def update(client \\ MillionSend.client(), id_or_alias, params)
      when is_binary(id_or_alias) and is_map(params) do
    Request.run(client,
      method: :patch,
      path: member_path(id_or_alias),
      body: params,
      as: Template
    )
  end

  @doc "`DELETE /templates/:id_or_alias`"
  @spec remove(Client.t(), String.t()) :: {:ok, Template.t()} | {:error, MillionSend.Error.t()}
  def remove(client \\ MillionSend.client(), id_or_alias) when is_binary(id_or_alias) do
    Request.run(client, method: :delete, path: member_path(id_or_alias), as: Template)
  end

  @doc "`POST /templates/:id_or_alias/publish` — a no-op kept for compatibility: templates publish on write."
  @spec publish(Client.t(), String.t()) :: {:ok, Template.t()} | {:error, MillionSend.Error.t()}
  def publish(client \\ MillionSend.client(), id_or_alias) when is_binary(id_or_alias) do
    Request.run(client, method: :post, path: member_path(id_or_alias) <> "/publish", as: Template)
  end

  @doc "`POST /templates/:id_or_alias/duplicate` — returns the copy's `id`."
  @spec duplicate(Client.t(), String.t()) :: {:ok, Template.t()} | {:error, MillionSend.Error.t()}
  def duplicate(client \\ MillionSend.client(), id_or_alias) when is_binary(id_or_alias) do
    Request.run(client,
      method: :post,
      path: member_path(id_or_alias) <> "/duplicate",
      as: Template
    )
  end

  defp member_path(id_or_alias), do: "/templates/" <> Request.encode(id_or_alias)
end
