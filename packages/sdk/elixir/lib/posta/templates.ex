defmodule Posta.Templates.Template do
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
    :version,
    :tags,
    :created_at,
    :updated_at,
    :current_version_id,
    :from,
    :subject,
    :reply_to,
    :preview_text,
    :html,
    :text,
    :variables,
    :has_unpublished_versions,
    :deleted
  ]
end

defmodule Posta.Templates do
  @moduledoc """
  Templates. Every member function takes the template id **or** its alias.

  Input maps are sent as given: `name`, `html`, `subject`, `text` and `alias`;
  on `update/3`, `nil` clears `subject`, `text` or `alias`. Templates are
  published on write, so `publish/2` is a no-op kept for Resend compatibility.

      {:ok, t} = Posta.Templates.create(%{name: "Welcome", alias: "welcome", html: "<p>Hi</p>"})
      Posta.Templates.get("welcome")
  """

  alias Posta.{Client, Request}
  alias Posta.Templates.Template

  @doc "`POST /templates`"
  @spec create(Client.t(), map()) :: {:ok, Template.t()} | {:error, Posta.Error.t()}
  def create(client \\ Posta.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/templates", body: params, as: Template)
  end

  @doc "`GET /templates/:id_or_alias`"
  @spec get(Client.t(), String.t()) :: {:ok, Template.t()} | {:error, Posta.Error.t()}
  def get(client \\ Posta.client(), id_or_alias) when is_binary(id_or_alias) do
    Request.run(client, method: :get, path: member_path(id_or_alias), as: Template)
  end

  @doc "`GET /templates`: accepts `limit:`, `after:`, `before:`."
  @spec list(Client.t() | keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(), do: list(Posta.client(), [])
  def list(%Client{} = client), do: list(client, [])
  def list(opts) when is_list(opts), do: list(Posta.client(), opts)

  @spec list(Client.t(), keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(%Client{} = client, opts) when is_list(opts) do
    Request.run(client,
      method: :get,
      path: "/templates",
      query: Request.list_query(opts),
      as: {:list, Template}
    )
  end

  @doc "`PATCH /templates/:id_or_alias`: `nil` clears `subject`, `text` or `alias`."
  @spec update(Client.t(), String.t(), map()) :: {:ok, Template.t()} | {:error, Posta.Error.t()}
  def update(client \\ Posta.client(), id_or_alias, params)
      when is_binary(id_or_alias) and is_map(params) do
    Request.run(client,
      method: :patch,
      path: member_path(id_or_alias),
      body: params,
      as: Template
    )
  end

  @doc "`DELETE /templates/:id_or_alias`"
  @spec remove(Client.t(), String.t()) :: {:ok, Template.t()} | {:error, Posta.Error.t()}
  def remove(client \\ Posta.client(), id_or_alias) when is_binary(id_or_alias) do
    Request.run(client, method: :delete, path: member_path(id_or_alias), as: Template)
  end

  @doc "`POST /templates/:id_or_alias/publish`: freezes the draft as the next numbered version; sends use published versions."
  @spec publish(Client.t(), String.t()) :: {:ok, Template.t()} | {:error, Posta.Error.t()}
  def publish(client \\ Posta.client(), id_or_alias) when is_binary(id_or_alias) do
    Request.run(client, method: :post, path: member_path(id_or_alias) <> "/publish", as: Template)
  end

  @doc "`POST /templates/:id_or_alias/duplicate`: returns the copy's `id`."
  @spec duplicate(Client.t(), String.t()) :: {:ok, Template.t()} | {:error, Posta.Error.t()}
  def duplicate(client \\ Posta.client(), id_or_alias) when is_binary(id_or_alias) do
    Request.run(client,
      method: :post,
      path: member_path(id_or_alias) <> "/duplicate",
      as: Template
    )
  end

  defp member_path(id_or_alias), do: "/templates/" <> Request.encode(id_or_alias)
end
