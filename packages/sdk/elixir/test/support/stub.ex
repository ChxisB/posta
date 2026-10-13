defmodule MillionSend.Test.Stub do
  @moduledoc false
  # A `MillionSend.HTTP` implementation that records the last request in the
  # process dictionary and replays a canned response set via `MillionSend.Test.Helpers`.
  # The request runs synchronously in the calling test process, so this is
  # isolated per (async) test without any shared state.
  @behaviour MillionSend.HTTP

  @impl true
  def request(request) do
    Process.put(:ms_last_request, request)
    Process.get(:ms_response, {:ok, %{status: 200, body: ~s({"id":"id_1"})}})
  end
end
