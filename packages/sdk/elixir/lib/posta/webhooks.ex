defmodule Posta.Webhooks.Webhook do
  @moduledoc """
  A webhook endpoint. `signing_secret` is returned by `create/2`, `get/2` and
  `rotate/3`; `status` is `"enabled" | "disabled"`. `previous_secret_expires_at`
  (`get/2`, `rotate/3`) is the ISO instant until which deliveries are also
  signed with the secret the current one replaced, `nil` outside a rotation's
  overlap window. `remove/2` populates `id` plus `deleted`.
  """
  @type t :: %__MODULE__{}
  defstruct [
    :object,
    :id,
    :endpoint,
    :events,
    :status,
    :signing_secret,
    :previous_secret_expires_at,
    :created_at,
    :deleted
  ]
end

defmodule Posta.Webhooks do
  @moduledoc """
  Webhooks. Input maps are sent as given: `create/2` accepts `endpoint`,
  `events` and an optional `signing_secret` (carry over an existing `whsec_`
  secret so the receiver keeps verifying unchanged); `update/3` accepts
  `endpoint`, `events` and `status`.

      Posta.Webhooks.create(%{
        endpoint: "https://acme.dev/hooks/email",
        events: ["email.delivered", "email.bounced"]
      })

  Subscribable events: `email.*` (`sent`, `delivered`, `delivery_delayed`,
  `bounced`, `complained`, `opened`, `clicked`), `deliverability.*` (`warning`,
  `paused`), `quota.*` (`warning`, `reached`, `paused`), `contact.*` (`created`,
  `updated`, `deleted`, `unsubscribed`, `resubscribed`, `topic_opt_in`,
  `topic_opt_out`) and `suppression.*` (`added`, `removed`).
  """

  alias Posta.{Client, Request}
  alias Posta.Webhooks.Webhook

  @doc "`POST /webhooks`: the response carries the `signing_secret`."
  @spec create(Client.t(), map()) :: {:ok, Webhook.t()} | {:error, Posta.Error.t()}
  def create(client \\ Posta.client(), params) when is_map(params) do
    Request.run(client, method: :post, path: "/webhooks", body: params, as: Webhook)
  end

  @doc "`GET /webhooks/:id`: includes the `signing_secret`."
  @spec get(Client.t(), String.t()) :: {:ok, Webhook.t()} | {:error, Posta.Error.t()}
  def get(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :get, path: member_path(id), as: Webhook)
  end

  @doc "`GET /webhooks`: accepts `limit:`, `after:`, `before:`."
  @spec list(Client.t() | keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(), do: list(Posta.client(), [])
  def list(%Client{} = client), do: list(client, [])
  def list(opts) when is_list(opts), do: list(Posta.client(), opts)

  @spec list(Client.t(), keyword()) :: {:ok, Posta.List.t()} | {:error, Posta.Error.t()}
  def list(%Client{} = client, opts) when is_list(opts) do
    Request.run(client,
      method: :get,
      path: "/webhooks",
      query: Request.list_query(opts),
      as: {:list, Webhook}
    )
  end

  @doc "`PATCH /webhooks/:id`: `endpoint`, `events`, `status` (`:enabled | :disabled`)."
  @spec update(Client.t(), String.t(), map()) :: {:ok, Webhook.t()} | {:error, Posta.Error.t()}
  def update(client \\ Posta.client(), id, params) when is_binary(id) and is_map(params) do
    Request.run(client, method: :patch, path: member_path(id), body: params, as: Webhook)
  end

  @doc """
  `POST /webhooks/:id/rotate`: mint a new signing secret (or install the
  `signing_secret:` given, a `whsec_` value). For `overlap_hours:` (0..72) the
  previous secret keeps signing too: every delivery in that window carries both
  signatures, so the receiver can switch at any point without a gap. Both
  options are optional; the response carries the new `signing_secret` and
  `previous_secret_expires_at`.

      Posta.Webhooks.rotate(id)
      Posta.Webhooks.rotate(id, overlap_hours: 24)
  """
  @spec rotate(String.t()) :: {:ok, Webhook.t()} | {:error, Posta.Error.t()}
  def rotate(id) when is_binary(id), do: rotate(Posta.client(), id, [])

  @spec rotate(Client.t() | String.t(), String.t() | keyword()) ::
          {:ok, Webhook.t()} | {:error, Posta.Error.t()}
  def rotate(%Client{} = client, id) when is_binary(id), do: rotate(client, id, [])

  def rotate(id, opts) when is_binary(id) and is_list(opts), do: rotate(Posta.client(), id, opts)

  @spec rotate(Client.t(), String.t(), keyword()) ::
          {:ok, Webhook.t()} | {:error, Posta.Error.t()}
  def rotate(%Client{} = client, id, opts) when is_binary(id) and is_list(opts) do
    Request.run(client,
      method: :post,
      path: member_path(id) <> "/rotate",
      body: Map.new(opts),
      as: Webhook
    )
  end

  @doc "`DELETE /webhooks/:id`"
  @spec remove(Client.t(), String.t()) :: {:ok, Webhook.t()} | {:error, Posta.Error.t()}
  def remove(client \\ Posta.client(), id) when is_binary(id) do
    Request.run(client, method: :delete, path: member_path(id), as: Webhook)
  end

  defp member_path(id), do: "/webhooks/" <> Request.encode(id)
end
