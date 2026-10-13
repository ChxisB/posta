defmodule Posta.Test.Stub do
  @moduledoc false
  # A `Posta.HTTP` implementation that records the last request in the
  # process dictionary and replays a canned response set via `Posta.Test.Helpers`.
  # The request runs synchronously in the calling test process, so this is
  # isolated per (async) test without any shared state.
  @behaviour Posta.HTTP

  @impl true
  def request(request) do
    Process.put(:posta_last_request, request)
    Process.get(:posta_response, {:ok, %{status: 200, body: ~s({"id":"id_1"})}})
  end
end
