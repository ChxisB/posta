defmodule MillionSend.Request do
  @moduledoc false
  # Internal request pipeline shared by every resource: builds the URL, headers
  # and JSON body, runs the request through the client's HTTP module, and casts
  # the response into `{:ok, struct}` / `{:error, %MillionSend.Error{}}`.
  #
  # Bodies are encoded exactly as given (atom or string keys, `nil` included):
  # the API validates them and rejects what it does not accept, so the SDK never
  # silently drops a field a caller wrote.

  alias MillionSend.{Client, Error}

  @spec run(Client.t(), keyword()) :: {:ok, term()} | {:error, Error.t()}
  def run(%Client{} = client, opts) do
    method = Keyword.fetch!(opts, :method)
    path = Keyword.fetch!(opts, :path)
    body = Keyword.get(opts, :body)
    query = Keyword.get(opts, :query)
    as = Keyword.get(opts, :as)

    url = client.base_url <> path <> encode_query(query)
    encoded = if is_nil(body), do: nil, else: Jason.encode!(body)
    headers = headers(client, method, encoded, opts)

    case client.http_client.request(%{method: method, url: url, headers: headers, body: encoded}) do
      {:ok, %{status: status, body: raw}} -> handle(status, raw, as)
      {:error, reason} -> {:error, Error.transport(reason)}
    end
  end

  @doc "Percent-encodes a single path segment the way `encodeURIComponent` does."
  @spec encode(term()) :: String.t()
  def encode(segment), do: URI.encode(to_string(segment), &URI.char_unreserved?/1)

  @doc false
  @spec list_query(keyword() | map()) :: keyword()
  def list_query(opts), do: [limit: opts[:limit], after: opts[:after], before: opts[:before]]

  @doc false
  @spec cast_struct(module(), map()) :: struct()
  def cast_struct(module, map) when is_map(map) do
    fields = module.__struct__() |> Map.from_struct() |> Map.keys()
    data = for f <- fields, Map.has_key?(map, to_string(f)), into: %{}, do: {f, map[to_string(f)]}
    struct(module, data)
  end

  defp handle(status, raw, as) do
    parsed = decode(raw)

    if status in 200..299 do
      {:ok, cast(parsed, as)}
    else
      {:error, Error.from_body(parsed, status)}
    end
  end

  defp headers(client, method, encoded, opts) do
    base = [
      {"authorization", "Bearer " <> client.api_key},
      {"accept", "application/json"},
      {"user-agent", client.user_agent}
    ]

    base =
      if not is_nil(encoded) and method in [:post, :patch],
        do: [{"content-type", "application/json"} | base],
        else: base

    # Idempotency and batch validation are POST-only on the wire.
    if method == :post do
      [
        {"idempotency-key", opts[:idempotency_key]},
        {"x-batch-validation", opts[:batch_validation]}
      ]
      |> Enum.reject(fn {_name, value} -> is_nil(value) end)
      |> Enum.map(fn {name, value} -> {name, to_string(value)} end)
      |> Kernel.++(base)
    else
      base
    end
  end

  defp encode_query(nil), do: ""

  defp encode_query(query) do
    query
    |> Enum.reject(fn {_key, value} -> is_nil(value) end)
    |> case do
      [] -> ""
      pairs -> "?" <> URI.encode_query(pairs)
    end
  end

  defp decode(nil), do: nil
  defp decode(""), do: nil

  defp decode(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, parsed} -> parsed
      {:error, _} -> body
    end
  end

  defp decode(body), do: body

  defp cast(parsed, nil), do: parsed

  # `as` for each item is a struct module or a cast function, as for a single response.
  defp cast(parsed, {:list, as}) when is_map(parsed) do
    %MillionSend.List{
      object: parsed["object"],
      has_more: parsed["has_more"] || false,
      data: Enum.map(parsed["data"] || [], &cast(&1, as))
    }
  end

  # A bare `{ data: [...] }` body (topics, batch) -> a plain list of structs.
  defp cast(parsed, {:data, as}) when is_map(parsed) do
    Enum.map(parsed["data"] || [], &cast(&1, as))
  end

  # Responses with nested typed shapes supply their own cast function.
  defp cast(parsed, fun) when is_function(fun, 1) and is_map(parsed), do: fun.(parsed)

  defp cast(parsed, module) when is_atom(module) and is_map(parsed),
    do: cast_struct(module, parsed)

  defp cast(parsed, _as), do: parsed
end
