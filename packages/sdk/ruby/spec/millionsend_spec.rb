# frozen_string_literal: true

RSpec.describe Millionsend do
  def ok(body = '{"id":"e1"}')
    { status: 200, body: body, headers: { "Content-Type" => "application/json" } }
  end

  describe "configuration" do
    it "falls back to MILLIONSEND_API_KEY and MILLIONSEND_BASE_URL" do
      Millionsend.api_key = nil
      Millionsend.base_url = nil
      with_env("MILLIONSEND_API_KEY" => "ms_env", "MILLIONSEND_BASE_URL" => "https://env.test") do
        expect(Millionsend.api_key).to eq("ms_env")
        expect(Millionsend.base_url).to eq("https://env.test")
      end
    end

    it "defaults base_url to MillionSend Cloud when unset" do
      Millionsend.base_url = nil
      with_env("MILLIONSEND_BASE_URL" => nil) do
        expect(Millionsend.base_url).to eq("https://api.millionsend.com")
      end
    end

    it "prefers an explicitly set value over the environment" do
      with_env("MILLIONSEND_API_KEY" => "ms_env", "MILLIONSEND_BASE_URL" => "https://env.test") do
        Millionsend.api_key = "ms_explicit"
        Millionsend.base_url = "https://explicit.test"
        expect(Millionsend.api_key).to eq("ms_explicit")
        expect(Millionsend.base_url).to eq("https://explicit.test")
      end
    end
  end

  describe "request wiring" do
    it "sends Bearer auth, Accept, Content-Type and a millionsend-ruby User-Agent" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Millionsend::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", html: "<p>h</p>" })

      expect(WebMock).to have_requested(:post, "https://api.test/emails")
        .with(headers: {
          "Authorization" => "Bearer ms_test",
          "Accept" => "application/json",
          "Content-Type" => "application/json",
        })
      expect(WebMock).to(have_requested(:post, "https://api.test/emails")
        .with { |req| req.headers["User-Agent"].to_s.start_with?("millionsend-ruby/") })
    end

    it "sends the params hash straight through as the JSON body" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Millionsend::Emails.send({ from: "a@x.dev", to: ["b@x.dev"], subject: "s", html: "<p>h</p>", reply_to: "r@x.dev" })

      expect(WebMock).to have_requested(:post, "https://api.test/emails").with(
        body: { "from" => "a@x.dev", "to" => ["b@x.dev"], "subject" => "s", "html" => "<p>h</p>", "reply_to" => "r@x.dev" }
      )
    end

    it "adds Idempotency-Key on emails.send when provided" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Millionsend::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" }, idempotency_key: "key-123")

      expect(WebMock).to have_requested(:post, "https://api.test/emails")
        .with(headers: { "Idempotency-Key" => "key-123" })
    end

    it "accepts resend-ruby's options: keyword shape on emails.send" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Millionsend::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" },
                               options: { idempotency_key: "key-456" })

      expect(WebMock).to have_requested(:post, "https://api.test/emails")
        .with(headers: { "Idempotency-Key" => "key-456" }, body: { "from" => "a@x.dev", "to" => "b@x.dev", "subject" => "s", "text" => "t" })
    end

    it "omits Idempotency-Key when not provided" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Millionsend::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" })

      expect(WebMock).to(have_requested(:post, "https://api.test/emails")
        .with { |req| !req.headers.key?("Idempotency-Key") })
    end

    it "refuses a non-loopback http base_url unless allow_insecure_http is set" do
      Millionsend.base_url = "http://mail.example.com"
      expect { Millionsend::Emails.get("e1") }
        .to raise_error(Millionsend::ApplicationError, /allow_insecure_http/)

      Millionsend.base_url = nil
      with_env("MILLIONSEND_BASE_URL" => "http://mail.example.com") do
        expect { Millionsend::Emails.get("e1") }
          .to raise_error(Millionsend::ApplicationError, /allow_insecure_http/)
      end

      Millionsend.base_url = "http://mail.example.com"
      Millionsend.allow_insecure_http = true
      stub_request(:get, "http://mail.example.com/emails/e1").to_return(ok)
      Millionsend::Emails.get("e1")
      expect(WebMock).to have_requested(:get, "http://mail.example.com/emails/e1")
    ensure
      Millionsend.allow_insecure_http = false
    end

    it "always accepts loopback http" do
      %w[http://localhost:3001 http://127.0.0.1:3001].each do |base|
        Millionsend.base_url = base
        stub_request(:get, "#{base}/emails/e1").to_return(ok)
        expect { Millionsend::Emails.get("e1") }.not_to raise_error
      end
    end

    it "strips a trailing slash from base_url" do
      Millionsend.base_url = "https://api.test/"
      stub_request(:get, "https://api.test/emails/e1").to_return(ok)
      Millionsend::Emails.get("e1")

      expect(WebMock).to have_requested(:get, "https://api.test/emails/e1")
    end

    it "returns the parsed response as a symbol-keyed hash" do
      stub_request(:post, "https://api.test/emails").to_return(ok('{"id":"abc"}'))
      res = Millionsend::Emails.send({ from: "a@x.dev", to: "b@x.dev", subject: "s", text: "t" })

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

      expect { Millionsend::Emails.get("e1") }.to raise_error(Millionsend::ValidationError) do |err|
        expect(err).to be_a(Millionsend::Error)
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

      expect { Millionsend::Contacts.get("nope") }.to raise_error(Millionsend::NotFoundError)
    end

    it "maps every API error name to its class" do
      {
        "missing_api_key" => Millionsend::MissingApiKeyError,
        "invalid_api_key" => Millionsend::InvalidApiKeyError,
        "restricted_api_key" => Millionsend::RestrictedApiKeyError,
        "sending_paused" => Millionsend::SendingPausedError,
        "broadcasts_paused" => Millionsend::BroadcastsPausedError,
        "rate_limit_exceeded" => Millionsend::RateLimitExceededError,
        "daily_quota_exceeded" => Millionsend::DailyQuotaExceededError,
        "invalid_idempotent_request" => Millionsend::InvalidIdempotentRequestError,
        "concurrent_idempotent_requests" => Millionsend::ConcurrentIdempotentRequestsError,
        "internal_server_error" => Millionsend::InternalServerError,
        "all_recipients_suppressed" => Millionsend::AllRecipientsSuppressedError,
        "unknown_future_name" => Millionsend::ApplicationError,
      }.each do |name, klass|
        err = Millionsend::Error.from_response(400, { statusCode: 400, name: name, message: "m" })
        expect(err).to be_a(klass)
        expect(err.name).to eq(name)
      end
    end

    it "falls back to ApplicationError for a non-canonical error body" do
      stub_request(:get, "https://api.test/emails/e1").to_return(status: 500, body: "gateway boom")

      expect { Millionsend::Emails.get("e1") }.to raise_error(Millionsend::ApplicationError) do |err|
        expect(err.status_code).to eq(500)
        expect(err.name).to eq("application_error")
        expect(err.message).to eq("Request failed with status 500")
      end
    end

    it "surfaces a transport failure as status_code nil" do
      stub_request(:get, "https://api.test/emails/e1").to_raise(Errno::ECONNREFUSED)

      expect { Millionsend::Emails.get("e1") }.to raise_error(Millionsend::Error) do |err|
        expect(err.status_code).to be_nil
      end
    end

    it "raises ApplicationError with a stable name when no API key is configured" do
      Millionsend.api_key = nil
      with_env("MILLIONSEND_API_KEY" => nil) do
        expect { Millionsend::Emails.get("e1") }
          .to raise_error(Millionsend::ApplicationError, /Missing API key/) do |err|
            expect(err.status_code).to be_nil
            expect(err.name).to eq("application_error")
          end
      end
    end
  end

  describe "call shapes" do
    it "accepts bare keywords, matching the README quickstart" do
      stub_request(:post, "https://api.test/emails").to_return(ok)
      Millionsend::Emails.send(from: "a@x.dev", to: "b@x.dev", subject: "s", html: "<p>h</p>")

      expect(WebMock).to have_requested(:post, "https://api.test/emails").with(
        body: { "from" => "a@x.dev", "to" => "b@x.dev", "subject" => "s", "html" => "<p>h</p>" }
      )
    end
  end

  describe Millionsend::Util do
    it "path-encodes a segment per RFC 3986 (space is %20, never +)" do
      expect(Millionsend::Util.encode("a b@x.dev")).to eq("a%20b%40x.dev")
      expect(Millionsend::Util.encode("a+b@x.dev")).to eq("a%2Bb%40x.dev")
    end
  end
end
