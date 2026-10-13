defmodule MillionSend.Test.Helpers do
  @moduledoc false
  alias MillionSend.Test.Stub

  @doc "A client wired to the recording stub."
  def client(opts \\ []) do
    MillionSend.client(
      Keyword.merge([api_key: "ms_test", base_url: "https://api.test", http_client: Stub], opts)
    )
  end

  @doc "Queue the next response. `body` may be a JSON string or a term to encode."
  def stub_response(status, body) when is_binary(body) do
    Process.put(:ms_response, {:ok, %{status: status, body: body}})
  end

  def stub_response(status, body) do
    Process.put(:ms_response, {:ok, %{status: status, body: Jason.encode!(body)}})
  end

  def stub_json(body), do: stub_response(200, body)

  @doc "Make the next request fail at the transport layer (never reaches the API)."
  def stub_transport(reason), do: Process.put(:ms_response, {:error, reason})

  def last_request, do: Process.get(:ms_last_request)
  def req_method, do: last_request().method
  def req_headers, do: Map.new(last_request().headers)
  def req_path, do: URI.parse(last_request().url).path
  def req_query, do: URI.parse(last_request().url).query

  def req_body do
    case last_request().body do
      nil -> nil
      body -> Jason.decode!(body)
    end
  end
end
