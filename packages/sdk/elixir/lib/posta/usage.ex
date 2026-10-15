defmodule Posta.Usage do
  @moduledoc """
  Plan limits and today's send count: a Posta extension with no Resend
  equivalent.

  `cloud` is `true` on Posta Cloud, where `plan` and `limits` apply;
  self-hosted deployments report `plan: nil` and `nil` limits. `limits`
  (`"emails_per_day"`, `"domains"`), `today` (`"emails_sent"`, `"resets_at"`)
  and `team` (`"id"`, `"name"`) are string-keyed maps as returned by the API.

      {:ok, usage} = Posta.Usage.get()
      usage.today["emails_sent"]
  """

  alias Posta.{Client, Request}

  @type t :: %__MODULE__{}
  defstruct [:object, :cloud, :plan, :limits, :today, :team, :app_url]

  @doc "`GET /usage`"
  @spec get(Client.t()) :: {:ok, t()} | {:error, Posta.Error.t()}
  def get(client \\ Posta.client()) do
    Request.run(client, method: :get, path: "/usage", as: __MODULE__)
  end
end
