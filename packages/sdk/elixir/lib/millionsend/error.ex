defmodule MillionSend.Error do
  @moduledoc """
  The error every non-2xx response carries, plus the client-side/transport case.

  `name` is the stable snake_case discriminant you can match on
  (`"validation_error"`, `"not_found"`, `"restricted_api_key"`, …). `status_code`
  is `nil` when the request never reached the API (a transport failure).
  """

  @type t :: %__MODULE__{
          name: String.t(),
          message: String.t(),
          status_code: non_neg_integer() | nil
        }

  defexception [:name, :message, :status_code]

  @impl true
  def message(%__MODULE__{name: name, message: message}), do: "#{name}: #{message}"

  @doc false
  @spec from_body(term(), non_neg_integer()) :: t()
  def from_body(body, status) when is_map(body) do
    %__MODULE__{
      name: string_or(body["name"], "application_error"),
      message: string_or(body["message"], "Request failed with status #{status}"),
      # The wire error body uses the camelCase key `statusCode`.
      status_code: if(is_integer(body["statusCode"]), do: body["statusCode"], else: status)
    }
  end

  def from_body(_body, status) do
    %__MODULE__{
      name: "application_error",
      message: "Request failed with status #{status}",
      status_code: status
    }
  end

  @doc false
  @spec transport(term()) :: t()
  def transport(reason) do
    %__MODULE__{name: "application_error", message: reason_message(reason), status_code: nil}
  end

  defp string_or(value, _default) when is_binary(value), do: value
  defp string_or(_value, default), do: default

  defp reason_message(%{__exception__: true} = exception), do: Exception.message(exception)
  defp reason_message(reason) when is_binary(reason), do: reason
  defp reason_message(reason), do: inspect(reason)
end
