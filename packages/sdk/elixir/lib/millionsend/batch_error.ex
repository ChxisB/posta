defmodule MillionSend.BatchError do
  @moduledoc """
  One rejected item of a permissive batch (`batch_validation: :permissive`):
  its position in the request array and the validation message.
  """

  @type t :: %__MODULE__{index: non_neg_integer(), message: String.t()}

  defstruct [:index, :message]

  @doc false
  @spec cast_list([map()] | nil) :: [t()]
  def cast_list(nil), do: []
  def cast_list(list), do: Enum.map(list, &MillionSend.Request.cast_struct(__MODULE__, &1))
end
