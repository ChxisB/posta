# frozen_string_literal: true

RSpec.describe Posta do
  def ok(body = '{"id":"e1"}')
    { status: 200, body: body, headers: { "Content-Type" => "application/json" } }
  end

  describe "configuration" do
    it "falls back to POSTA_API_KEY and POSTA_BASE_URL" do
      Posta.api_key = nil
      Posta.base_url = nil
      with_env("POSTA_API_KEY" => "po_env", "POSTA_BASE_URL" => "https://env.test") do
        expect(Posta.api_key).to eq("po_env")
        expect(Posta.base_url).to eq("https://env.test")
      end
    end

    it "defaults base_url to Posta Cloud when unset" do
      Posta.base_url = nil
      with_env("POSTA_BASE_URL" => nil) do
        expect(Posta.base_url).to eq("https://api.posta.example")
      end
    end

    it "prefers an explicitly set value over the environment" do
      with_env("POSTA_API_KEY" => "po_env", "POSTA_BASE_URL" => "https://env.test") do
        Posta.api_key = "po_explicit"
        Posta.base_url = "https://explicit.test"
        expect(Posta.api_key).to eq("po_explicit")
        expect(Posta.base_url).to eq("https://explicit.test")
      end
    end
  end

  describe "request wiring" do
    it "sends Bearer auth, Accept, Content-Type and a posta-ruby User-Agent" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Posta::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", html: "<p>h</p>" })

      expect(WebMock).to have_requested(:post, "https://api.test/emails")
        .with(headers: {
          "Authorization" => "Bearer po_test",
          "Accept" => "application/json",
          "Content-Type" => "application/json",
        })
      expect(WebMock).to(have_requested(:post, "https://api.test/emails")
        .with { |req| req.headers["User-Agent"].to_s.start_with?("posta-ruby/") })
    end

    it "sends the params hash straight through as the JSON body" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Posta::Emails.send({ from: "a@x.dev", to: ["b@x.dev"], subject: "s", html: "<p>h</p>", reply_to: "r@x.dev" })

      expect(WebMock).to have_requested(:post, "https://api.test/emails").with(
        body: { "from" => "a@x.dev", "to" => ["b@x.dev"], "subject" => "s", "html" => "<p>h</p>", "reply_to" => "r@x.dev" }
      )
    end

    it "adds Idempotency-Key on emails.send when provided" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Posta::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" }, idempotency_key: "key-123")

      expect(WebMock).to have_requested(:post, "https://api.test/emails")
        .with(headers: { "Idempotency-Key" => "key-123" })
    end

    it "accepts resend-ruby's options: keyword shape on emails.send" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Posta::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" },
                         options: { idempotency_key: "key-456" })

      expect(WebMock).to have_requested(:post, "https://api.test/emails")
        .with(headers: { "Idempotency-Key" => "key-456" }, body: { "from" => "a@x.dev", "to" => "b@x.dev", "subject" => "s", "text" => "t" })
    end

    it "omits Idempotency-Key when not provided" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Posta::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" })

      expect(WebMock).to(have_requested(:post, "https://api.test/emails")
        .with { |req| !req.headers.key?("Idempotency-Key") })
    end

    it "refuses a non-loopback http base_url unless allow_insecure_http is set" do
      Posta.base_url = "http://mail.example.com"
      expect { Posta::Emails.get("e1") }
        .to raise_error(Posta::ApplicationError, /allow_insecure_http/)

      Posta.base_url = nil
      with_env("POSTA_BASE_URL" => "http://mail.example.com") do
        expect { Posta::Emails.get("e1") }
          .to raise_error(Posta::ApplicationError, /allow_insecure_http/)
      end

      Posta.base_url = "http://mail.example.com"
      Posta.allow_insecure_http = true
      stub_request(:get, "http://mail.example.com/emails/e1").to_return(ok)
      Posta::Emails.get("e1")
      expect(WebMock).to have_requested(:get, "http://mail.example.com/emails/e1")
    ensure
      Posta.allow_insecure_http = false
    end

    it "always accepts loopback http" do
      %w[http://localhost:3001 http://127.0.0.1:3001].each do |base|
        Posta.base_url = base
        stub_request(:get, "#{base}/emails/e1").to_return(ok)
        expect { Posta::Emails.get("e1") }.not_to raise_error
      end
    end

    it "strips a trailing slash from base_url" do
      Posta.base_url = "https://api.test/"
      stub_request(:get, "https://api.test/emails/e1").to_return(ok)
      Posta::Emails.get("e1")

      expect(WebMock).to have_requested(:get, "https://api.test/emails/e1")
    end

    it "returns the parsed response as a symbol-keyed hash" do
      stub_request(:post, "https://api.test/emails").to_return(ok('{"id":"abc"}'))
      res = Posta::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" })

      expect(res).to eq({ id: "abc" })
    end
  end

  describe "errors" do
    it "raises a typed error carrying status_code, name and message on non-2xx" do
      stub_request(:get, "https://api.test/emails/e1").to_return(
        status: 422,
        body: '{"statusCode":422,"name":"validation_error","message":"bad"}',
        headers: { "Content-Type" => "application/json" }
      )

      expect { Posta::Emails.get("e1") }.to raise_error(Posta::ValidationError) do |err|
        expect(err).to be_a(Posta::Error)
        expect(err.status_code).to eq(422)
        expect(err.name).to eq("validation_error")
        expect(err.message).to eq("bad")
      end
    end

    it "maps not_found to NotFoundError" do
      stub_request(:get, "https://api.test/contacts/nope").to_return(
        status: 404,
        body: '{"statusCode":404,"name":"not_found","message":"missing"}',
        headers: { "Content-Type" => "application/json" }
      )

      expect { Posta::Contacts.get("nope") }.to raise_error(Posta::NotFoundError)
    end

    it "maps every API error name to its class" do
      {
        "missing_api_key" => Posta::MissingApiKeyError,
        "invalid_api_key" => Posta::InvalidApiKeyError,
        "restricted_api_key" => Posta::RestrictedApiKeyError,
        "sending_paused" => Posta::SendingPausedError,
        "broadcasts_paused" => Posta::BroadcastsPausedError,
        "rate_limit_exceeded" => Posta::RateLimitExceededError,
        "daily_quota_exceeded" => Posta::DailyQuotaExceededError,
        "invalid_idempotent_request" => Posta::InvalidIdempotentRequestError,
        "concurrent_idempotent_requests" => Posta::ConcurrentIdempotentRequestsError,
        "internal_server_error" => Posta::InternalServerError,
        "all_recipients_suppressed" => Posta::AllRecipientsSuppressedError,
        "unknown_future_name" => Posta::ApplicationError,
      }.each do |name, klass|
        err = Posta::Error.from_response(400, { statusCode: 400, name: name, message: "m" })
        expect(err).to be_a(klass)
        expect(err.name).to eq(name)
      end
    end

    it "falls back to ApplicationError for a non-canonical error body" do
      stub_request(:get, "https://api.test/emails/e1").to_return(status: 500, body: "gateway boom")

      expect { Posta::Emails.get("e1") }.to raise_error(Posta::ApplicationError) do |err|
        expect(err.status_code).to eq(500)
        expect(err.name).to eq("application_error")
        expect(err.message).to eq("Request failed with status 500")
      end
    end

    it "surfaces a transport failure as status_code nil" do
      stub_request(:get, "https://api.test/emails/e1").to_raise(Errno::ECONNREFUSED)

      expect { Posta::Emails.get("e1") }.to raise_error(Posta::Error) do |err|
        expect(err.status_code).to be_nil
      end
    end

    it "raises ApplicationError with a stable name when no API key is configured" do
      Posta.api_key = nil
      with_env("POSTA_API_KEY" => nil) do
        expect { Posta::Emails.get("e1") }
          .to raise_error(Posta::ApplicationError, /Missing API key/) do |err|
            expect(err.status_code).to be_nil
            expect(err.name).to eq("application_error")
          end
      end
    end
  end

  describe "call shapes" do
    it "accepts bare keywords, matching the README quickstart" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Posta::Emails.send(from: "a@x.dev", to: "b@x.dev", subject: "s", html: "<p>h</p>")

      expect(WebMock).to have_requested(:post, "https://api.test/emails").with(
        body: { "from" => "a@x.dev", "to" => "b@x.dev", "subject" => "s", "html" => "<p>h</p>" }
      )
    end
  end

  describe Posta::Util do
    it "path-encodes a segment per RFC 3986 (space is %20, never +)" do
      expect(Posta::Util.encode("a b@x.dev")).to eq("a%20b%40x.dev")
      expect(Posta::Util.encode("a+b@x.dev")).to eq("a%2Bb%40x.dev")
    end
  end
end
