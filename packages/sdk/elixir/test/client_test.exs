defmodule Posta.ClientTest do
  # Not async: mutates OS env and application env.
  use ExUnit.Case, async: false

  import Posta.Test.Helpers

  alias Posta.Test.Stub

  describe "construction" do
    test "raises without an api key and without the env var" do
      prev = System.get_env("POSTA_API_KEY")
      System.delete_env("POSTA_API_KEY")

      assert_raise ArgumentError, ~r/Missing Posta API key/, fn ->
        Posta.client()
      end

      if prev, do: System.put_env("POSTA_API_KEY", prev)
    end

    test "falls back to POSTA_API_KEY / POSTA_BASE_URL" do
      System.put_env("POSTA_API_KEY", "po_env")
      System.put_env("POSTA_BASE_URL", "https://env.example")
      client = Posta.client()
      assert client.api_key == "po_env"
      assert client.base_url == "https://env.example"
      System.delete_env("POSTA_API_KEY")
      System.delete_env("POSTA_BASE_URL")
    end

    test "defaults the base url to Posta Cloud; the option still wins" do
      prev = System.get_env("POSTA_BASE_URL")
      System.delete_env("POSTA_BASE_URL")
      on_exit(fn -> if prev, do: System.put_env("POSTA_BASE_URL", prev) end)

      assert Posta.client(api_key: "k").base_url == "https://api.posta.example"

      assert Posta.client(api_key: "k", base_url: "https://mail.example").base_url ==
               "https://mail.example"
    end

    test "refuses a non-loopback http base url unless allow_insecure_http is set" do
      assert_raise ArgumentError, ~r/allow_insecure_http/, fn ->
        Posta.client(api_key: "k", base_url: "http://mail.example.com")
      end

      System.put_env("POSTA_BASE_URL", "http://mail.example.com")
      on_exit(fn -> System.delete_env("POSTA_BASE_URL") end)

      assert_raise ArgumentError, ~r/allow_insecure_http/, fn ->
        Posta.client(api_key: "k")
      end

      client =
        Posta.client(
          api_key: "k",
          base_url: "http://mail.example.com",
          allow_insecure_http: true
        )

      assert client.base_url == "http://mail.example.com"
      assert Posta.client(api_key: "k", base_url: "http://localhost:3001").base_url
      assert Posta.client(api_key: "k", base_url: "http://127.0.0.1:3001").base_url
    end

    test "keeps the api key out of inspect output" do
      client = Posta.client(api_key: "po_secret_key", base_url: "https://api.test")
      refute inspect(client) =~ "po_secret_key"
      assert client.api_key == "po_secret_key"
    end

    test "strips trailing slashes from the base url" do
      client = Posta.client(api_key: "k", base_url: "https://api.test//")
      assert client.base_url == "https://api.test"
    end

    test "reads a configured default client (app env) for the no-client arity" do
      Application.put_env(:posta, Posta.Client,
        api_key: "po_cfg",
        base_url: "https://api.test",
        http_client: Stub
      )

      on_exit(fn -> Application.delete_env(:posta, Posta.Client) end)

      assert {:ok, _} = Posta.Emails.get("e1")
      assert req_path() == "/emails/e1"
      assert req_headers()["authorization"] == "Bearer po_cfg"
    end
  end

  describe "request wiring" do
    test "sets bearer auth, accept, user-agent and content-type on writes" do
      assert {:ok, _} =
               Posta.Emails.send(client(), %{
                 from: "a@x.dev",
                 to: "b@x.dev",
                 subject: "s",
                 html: "<p>h</p>"
               })

      headers = req_headers()
      assert headers["authorization"] == "Bearer po_test"
      assert headers["accept"] == "application/json"
      assert headers["content-type"] == "application/json"
      assert headers["user-agent"] =~ ~r{^posta-elixir/\d}
    end

    test "appends a user-agent suffix" do
      c = client(user_agent: "acme-app/2")
      assert {:ok, _} = Posta.Emails.get(c, "e1")
      assert req_headers()["user-agent"] =~ ~r{^posta-elixir/\S+ acme-app/2$}
    end

    test "omits content-type on GET and bodyless POST" do
      assert {:ok, _} = Posta.Emails.get(client(), "e1")
      refute Map.has_key?(req_headers(), "content-type")

      assert {:ok, _} = Posta.Emails.cancel(client(), "e1")
      refute Map.has_key?(req_headers(), "content-type")
    end

    test "maps input to the snake_case wire and omits absent keys" do
      assert {:ok, _} =
               Posta.Emails.send(client(), %{
                 from: "a@x.dev",
                 to: ["b@x.dev"],
                 subject: "s",
                 html: "<p>h</p>",
                 reply_to: "r@x.dev",
                 scheduled_at: "2999-01-01T00:00:00Z"
               })

      assert req_body() == %{
               "from" => "a@x.dev",
               "to" => ["b@x.dev"],
               "subject" => "s",
               "html" => "<p>h</p>",
               "reply_to" => "r@x.dev",
               "scheduled_at" => "2999-01-01T00:00:00Z"
             }
    end

    test "sends idempotency-key only on POST when provided" do
      assert {:ok, _} =
               Posta.Emails.send(
                 client(),
                 %{from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t"},
                 idempotency_key: "key-123"
               )

      assert req_headers()["idempotency-key"] == "key-123"

      # GET carries no idempotency key even if the header would be POST-only.
      assert {:ok, _} = Posta.Emails.get(client(), "e1")
      refute Map.has_key?(req_headers(), "idempotency-key")
    end

    test "returns {:ok, struct} on 200" do
      stub_json(%{"id" => "abc"})

      assert {:ok, email} =
               Posta.Emails.send(client(), %{
                 from: "a@x.dev",
                 to: "b@x.dev",
                 subject: "s",
                 text: "t"
               })

      assert email.__struct__ == Posta.Emails.Email
      assert email.id == "abc"
    end

    test "parses a non-2xx body into %Posta.Error{}" do
      stub_response(422, %{"statusCode" => 422, "name" => "validation_error", "message" => "bad"})

      assert {:error, error} =
               Posta.Emails.send(client(), %{
                 from: "a@x.dev",
                 to: "b@x.dev",
                 subject: "s",
                 text: "t"
               })

      assert %Posta.Error{status_code: 422, name: "validation_error", message: "bad"} = error
    end

    test "parses the 422 all_recipients_suppressed name" do
      stub_response(422, %{
        "statusCode" => 422,
        "name" => "all_recipients_suppressed",
        "message" => "All recipients are suppressed"
      })

      assert {:error, %Posta.Error{status_code: 422, name: "all_recipients_suppressed"}} =
               Posta.Emails.send(client(), %{
                 from: "a@x.dev",
                 to: "b@x.dev",
                 subject: "s",
                 text: "t",
                 topic_id: "t1"
               })
    end

    test "surfaces a transport failure as status_code nil" do
      stub_transport(%RuntimeError{message: "econnrefused"})

      assert {:error, error} =
               Posta.Emails.send(client(), %{
                 from: "a@x.dev",
                 to: "b@x.dev",
                 subject: "s",
                 text: "t"
               })

      assert error.status_code == nil
      assert error.message =~ "econnrefused"
    end

    test "falls back to a generic error when the body is not the canonical shape" do
      stub_response(500, "gateway boom")
      assert {:error, error} = Posta.Emails.get(client(), "e1")

      assert error == %Posta.Error{
               name: "application_error",
               message: "Request failed with status 500",
               status_code: 500
             }
    end
  end
end
