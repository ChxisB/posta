defmodule MillionSend do
  @moduledoc """
  Official Elixir client for [MillionSend](https://github.com/MillionSend/millionsend) —
  a self-hostable, Resend-compatible email API.

  The API is wire-compatible with Resend and this SDK mirrors `resend-elixir`, so
  migrating is mostly a find-and-replace: swap the module prefix (and, when
  self-hosting, point `base_url` at your instance).

  ## Configuration

  Configure a default client via application env:

      config :millionsend, MillionSend.Client,
        api_key: System.get_env("MILLIONSEND_API_KEY")

  Every resource function then works without an explicit client:

      {:ok, email} = MillionSend.Emails.send(%{
        from: "Acme <onboarding@acme.dev>",
        to: "success@simulator.amazonses.com",
        subject: "Hello",
        html: "<strong>it works</strong>"
      })

  Or build a client explicitly and pass it as the first argument:

      client = MillionSend.client(api_key: "ms_123", base_url: "https://mail.acme.dev")
      {:ok, email} = MillionSend.Emails.send(client, %{...})

  `api_key`/`base_url` also fall back to the `MILLIONSEND_API_KEY` and
  `MILLIONSEND_BASE_URL` environment variables. `base_url` defaults to
  MillionSend Cloud (`https://api.millionsend.com`); a self-hosted instance sets
  its own origin.

  ## Return values

  Every function returns `{:ok, struct}` on an HTTP 200 or
  `{:error, %MillionSend.Error{}}` on any non-2xx or transport failure. A
  transport/client failure that never reached the API carries `status_code: nil`.
  """

  @doc """
  Builds a `MillionSend.Client`. See `MillionSend.Client.new/1` for the options.

  Raises `ArgumentError` when no API key is configured.
  """
  @spec client(keyword()) :: MillionSend.Client.t()
  defdelegate client(opts \\ []), to: MillionSend.Client, as: :new
end
