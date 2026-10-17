defmodule Posta.Deliverability do
  @moduledoc """
  Account-level deliverability score over the trailing window.

  Scores are 0 to 10 with one decimal; `score`, `band`, `content_score` and
  `outcome_score` are `nil` when there is not enough data to compute them.
  `band` (`"excellent" | "good" | "needs_attention" | "at_risk"`) and
  `guardrail_status` (`"ok" | "warning" | "paused"`) are plain strings so
  future wire values never break decoding.

      {:ok, report} = Posta.Deliverability.get()
  """

  alias Posta.{Client, Request}

  defstruct [
    :object,
    :score,
    :band,
    :content_score,
    :outcome_score,
    :complaint_rate,
    :hard_bounce_rate,
    :emails_sent,
    :scored_recipients,
    :window_days,
    :insufficient_outcome_data,
    :guardrail_status,
    :score_version
  ]

  @doc "`GET /deliverability`"
  @spec get(Client.t()) :: {:ok, %__MODULE__{}} | {:error, Posta.Error.t()}
  def get(client \\ Posta.client()) do
    Request.run(client, method: :get, path: "/deliverability", as: __MODULE__)
  end
end
