defmodule MillionSend.HTTP do
  @moduledoc """
  Behaviour for the swappable HTTP layer. The default is `MillionSend.HTTP.Req`;
  tests inject a stub by building a client with `http_client:` set to a module
  implementing this behaviour.
  """

  @type request :: %{
          method: :get | :post | :patch | :delete,
          url: String.t(),
          headers: [{String.t(), String.t()}],
          body: iodata() | nil
        }

  @type response :: %{status: non_neg_integer(), body: binary() | nil}

  @callback request(request()) :: {:ok, response()} | {:error, term()}
end

defmodule MillionSend.HTTP.Req do
  @moduledoc "Default `MillionSend.HTTP` implementation, backed by Req."
  @behaviour MillionSend.HTTP

  @impl true
  def request(%{method: method, url: url, headers: headers, body: body}) do
    case Req.request(
           method: method,
           url: url,
           headers: headers,
           body: body,
           decode_body: false,
           retry: false
         ) do
      {:ok, %Req.Response{status: status, body: resp_body}} ->
        {:ok, %{status: status, body: resp_body}}

      {:error, reason} ->
        {:error, reason}
    end
  end
end
