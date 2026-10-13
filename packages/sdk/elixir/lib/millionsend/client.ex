defmodule MillionSend.Client do
  @moduledoc """
  A resolved MillionSend client: API key, base URL, User-Agent and the HTTP
  module to run requests through. Build one with `MillionSend.client/1`.
  """

  @default_base_url "https://api.millionsend.com"
  @version Mix.Project.config()[:version]
  @user_agent "millionsend-elixir/#{@version}"

  @type t :: %__MODULE__{
          api_key: String.t(),
          base_url: String.t(),
          user_agent: String.t(),
          http_client: module()
        }

  # The API key must never reach logs or crash reports through inspect/1.
  @derive {Inspect, except: [:api_key]}
  defstruct [:api_key, :base_url, :user_agent, http_client: MillionSend.HTTP.Req]

  @loopback_hosts ["localhost", "127.0.0.1", "::1"]

  @doc """
  Resolves a client from (in precedence order) the given `opts`, the
  `config :millionsend, MillionSend.Client` application env, OS environment
  variables, and finally the built-in defaults.

  Options: `:api_key`, `:base_url`, `:user_agent` (a suffix appended to the
  SDK's own User-Agent token), `:http_client` (a module implementing
  `MillionSend.HTTP`, for tests/proxies), `:allow_insecure_http` (accept a
  plain `http://` base URL on a non-loopback host; off by default because the
  API key travels as a bearer header).
  """
  @spec new(keyword()) :: t()
  # Credo scores each `||` in the opts/config/env fallback chains as a branch.
  # credo:disable-for-next-line Credo.Check.Refactor.CyclomaticComplexity
  def new(opts \\ []) do
    config = Application.get_env(:millionsend, __MODULE__, [])

    api_key = opts[:api_key] || config[:api_key] || System.get_env("MILLIONSEND_API_KEY")

    unless is_binary(api_key) and api_key != "" do
      raise ArgumentError,
            "Missing MillionSend API key. Pass MillionSend.client(api_key: ...), set " <>
              "config :millionsend, MillionSend.Client, api_key: ..., or the " <>
              "MILLIONSEND_API_KEY environment variable."
    end

    base_url =
      (opts[:base_url] || config[:base_url] || System.get_env("MILLIONSEND_BASE_URL") ||
         @default_base_url)
      |> String.trim_trailing("/")

    allow_insecure_http = opts[:allow_insecure_http] || config[:allow_insecure_http] || false

    if not allow_insecure_http and insecure_http?(base_url) do
      raise ArgumentError,
            "Refusing to send the API key over plain http to #{base_url}. Use https, " <>
              "or set allow_insecure_http: true."
    end

    %__MODULE__{
      api_key: api_key,
      base_url: base_url,
      http_client: opts[:http_client] || config[:http_client] || MillionSend.HTTP.Req,
      user_agent: user_agent(opts[:user_agent] || config[:user_agent])
    }
  end

  defp insecure_http?(url) do
    case URI.parse(url) do
      %URI{scheme: "http", host: host} when is_binary(host) ->
        host = String.downcase(host)
        host not in @loopback_hosts and not String.starts_with?(host, "127.")

      _ ->
        false
    end
  end

  defp user_agent(nil), do: @user_agent
  defp user_agent(suffix) when is_binary(suffix), do: @user_agent <> " " <> suffix
end
