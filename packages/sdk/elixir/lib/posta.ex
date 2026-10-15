defmodule Posta do
  @moduledoc """
  Official Elixir client for [Posta](https://github.com/ChxisB/posta):
  a self-hostable, Resend-compatible email API.

  The API is wire-compatible with Resend and this SDK mirrors `resend-elixir`, so
  migrating is mostly a find-and-replace: swap the module prefix (and, when
  self-hosting, point `base_url` at your instance).

  ## Configuration

  Configure a default client via application env:

      config :posta, Posta.Client,
        api_key: System.get_env("POSTA_API_KEY")

  Every resource function then works without an explicit client:

      {:ok, email} = Posta.Emails.send(%{
        from: "Acme <onboarding@acme.dev>",
        to: "success@simulator.amazonses.com",
        subject: "Hello",
        html: "<strong>it works</strong>"
      })

  Or build a client explicitly and pass it as the first argument:

      client = Posta.client(api_key: "po_123", base_url: "https://mail.acme.dev")
      {:ok, email} = Posta.Emails.send(client, %{...})

  `api_key`/`base_url` also fall back to the `POSTA_API_KEY` and
  `POSTA_BASE_URL` environment variables. `base_url` defaults to
  Posta Cloud (`https://api.posta.example`); a self-hosted instance sets
  its own origin.

  ## Return values

  Every function returns `{:ok, struct}` on an HTTP 200 or
  `{:error, %Posta.Error{}}` on any non-2xx or transport failure. A
  transport/client failure that never reached the API carries `status_code: nil`.
  """

  @doc """
  Builds a `Posta.Client`. See `Posta.Client.new/1` for the options.

  Raises `ArgumentError` when no API key is configured.
  """
  @spec client(keyword()) :: Posta.Client.t()
  defdelegate client(opts \\ []), to: Posta.Client, as: :new
end
