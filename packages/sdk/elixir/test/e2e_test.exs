# End-to-end smoke test against a real Posta instance. Opt-in: only
# compiled and run when POSTA_API_KEY is set (and POSTA_BASE_URL
# when the target is not Posta Cloud). It exercises the contact
# lifecycle, which needs no verified domain. Sending is not asserted here —
# that requires a verified sender domain.
#
#   POSTA_API_KEY=po_... POSTA_BASE_URL=http://localhost:3001 mix test
if System.get_env("POSTA_API_KEY") do
  defmodule Posta.E2ETest do
    use ExUnit.Case, async: false

    setup_all do
      client = Posta.client()
      {:ok, client: client}
    end

    test "creates, reads, updates and deletes a contact", %{client: client} do
      email = "sdk-e2e-#{System.unique_integer([:positive])}@example.com"

      assert {:ok, created} = Posta.Contacts.create(client, %{email: email, first_name: "Ada"})

      assert created.id

      on_exit(fn -> Posta.Contacts.remove(client, %{email: email}) end)

      assert {:ok, fetched} = Posta.Contacts.get(client, %{email: email})
      assert fetched.email == email
      assert fetched.first_name == "Ada"

      assert {:ok, _} = Posta.Contacts.update(client, %{email: email, unsubscribed: true})

      assert {:ok, removed} = Posta.Contacts.remove(client, %{email: email})
      assert removed.deleted == true
    end

    test "surfaces a not_found error without raising", %{client: client} do
      assert {:error, error} = Posta.Contacts.get(client, %{email: "does-not-exist@example.com"})

      assert error.name == "not_found"
    end
  end
end
