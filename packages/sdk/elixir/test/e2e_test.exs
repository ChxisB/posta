# End-to-end smoke test against a real MillionSend instance. Opt-in: only
# compiled and run when MILLIONSEND_API_KEY is set (and MILLIONSEND_BASE_URL
# when the target is not MillionSend Cloud). It exercises the contact
# lifecycle, which needs no verified domain. Sending is not asserted here —
# that requires a verified sender domain.
#
#   MILLIONSEND_API_KEY=ms_... MILLIONSEND_BASE_URL=http://localhost:3001 mix test
if System.get_env("MILLIONSEND_API_KEY") do
  defmodule MillionSend.E2ETest do
    use ExUnit.Case, async: false

    setup_all do
      client = MillionSend.client()
      {:ok, client: client}
    end

    test "creates, reads, updates and deletes a contact", %{client: client} do
      email = "sdk-e2e-#{System.unique_integer([:positive])}@example.com"

      assert {:ok, created} =
               MillionSend.Contacts.create(client, %{email: email, first_name: "Ada"})

      assert created.id

      on_exit(fn -> MillionSend.Contacts.remove(client, %{email: email}) end)

      assert {:ok, fetched} = MillionSend.Contacts.get(client, %{email: email})
      assert fetched.email == email
      assert fetched.first_name == "Ada"

      assert {:ok, _} = MillionSend.Contacts.update(client, %{email: email, unsubscribed: true})

      assert {:ok, removed} = MillionSend.Contacts.remove(client, %{email: email})
      assert removed.deleted == true
    end

    test "surfaces a not_found error without raising", %{client: client} do
      assert {:error, error} =
               MillionSend.Contacts.get(client, %{email: "does-not-exist@example.com"})

      assert error.name == "not_found"
    end
  end
end
