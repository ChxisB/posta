defmodule MillionSend.List do
  @moduledoc """
  The pagination envelope returned by list endpoints: `data` holds the cast
  structs, `has_more` says whether another page exists. Paginate with the
  `after:`/`before:` keyset cursors.
  """

  @type t :: %__MODULE__{object: String.t() | nil, data: list(), has_more: boolean()}

  defstruct object: "list", data: [], has_more: false
end
