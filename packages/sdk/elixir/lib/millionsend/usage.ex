defmodule MillionSend.Usage do
  @moduledoc """
  Plan limits and today's send count — a MillionSend extension with no Resend
  equivalent.

  `cloud` is `true` on MillionSend Cloud, where `plan` and `limits` apply;
  self-hosted deployments report `plan: nil` and `nil` limits. `limits`
  (`"emails_per_day"`, `"domains"`), `today` (`"emails_sent"`, `"resets_at"`)
  and `team` (`"id"`, `"name"`) are string-keyed maps as returned by the API.

      {:ok, usage} = MillionSend.Usage.get()
      usage.today["emails_sent"]
  """

  alias MillionSend.{Client, Request}

  @type t :: %__MODULE__{}
  defstruct [:object, :cloud, :plan, :limits, :today, :team, :app_url]

  @doc "`GET /usage`"
  @spec get(Client.t()) :: {:ok, t()} | {:error, MillionSend.Error.t()}
  def get(client \\ MillionSend.client()) do
    Request.run(client, method: :get, path: "/usage", as: __MODULE__)
  end
end
