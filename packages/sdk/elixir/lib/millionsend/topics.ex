defmodule MillionSend.Topics.Topic do
  @moduledoc "A subscription topic — a granular unsubscribe category."
  @type t :: %__MODULE__{}
  defstruct [
    :object,
    :id,
    :name,
    :description,
    :default_subscription,
    :visibility,
    :created_at,
    :deleted
  ]
end

defmodule MillionSend.Topics do
  @moduledoc """
  Subscription topics. Input maps are sent as given: `name`,
  `default_subscription` (`:opt_in | :opt_out`), `description` and `visibility`
  (`:private | :public`).

      MillionSend.Topics.create(%{name: "Product updates", default_subscription: :opt_in})
  """

  alias MillionSend.{Client, Request}
  alias MillionSend.Topics.Topic

  @doc "`POST /topics`"
  @spec create(Client.t(), map()) :: {:ok, Topic.t()} | {:error, MillionSend.Error.t()}
  def create(client \\ MillionSend.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/topics", body: params, as: Topic)
  end

  @doc "`GET /topics/:id`"
  @spec get(Client.t(), String.t()) :: {:ok, Topic.t()} | {:error, MillionSend.Error.t()}
  def get(client \\ MillionSend.client(), id) when is_binary(id) do
    Request.run(client, method: :get, path: "/topics/" <> Request.encode(id), as: Topic)
  end

  @doc "`GET /topics` — a bare, unpaginated `{ data: [...] }`; returns a plain list of `Topic`s."
  @spec list(Client.t()) :: {:ok, [Topic.t()]} | {:error, MillionSend.Error.t()}
  def list(client \\ MillionSend.client()) do
    Request.run(client, method: :get, path: "/topics", as: {:data, Topic})
  end

  @doc "`PATCH /topics/:id` — `name`, `description`, `visibility`."
  @spec update(Client.t(), String.t(), map()) ::
          {:ok, Topic.t()} | {:error, MillionSend.Error.t()}
  def update(client \\ MillionSend.client(), id, params) when is_binary(id) and is_map(params) do
    Request.run(client,
      method: :patch,
      path: "/topics/" <> Request.encode(id),
      body: params,
      as: Topic
    )
  end

  @doc "`DELETE /topics/:id`"
  @spec remove(Client.t(), String.t()) :: {:ok, Topic.t()} | {:error, MillionSend.Error.t()}
  def remove(client \\ MillionSend.client(), id) when is_binary(id) do
    Request.run(client, method: :delete, path: "/topics/" <> Request.encode(id), as: Topic)
  end
end
