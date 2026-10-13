# frozen_string_literal: true

module Millionsend
  # Transactional email: send one, look it up, reschedule or cancel a scheduled
  # one, list what was sent. Params hashes go on the wire as-is (from, to, cc,
  # bcc, reply_to, subject, html, text, headers, tags, attachments,
  # scheduled_at, topic_id, template), so nothing a caller passes is dropped.
  module Emails
    class << self
      # POST /emails. Accepts a params hash or bare keywords
      # (Emails.send(from: ..., to: ...)); a trailing hash carries the request
      # options as either `idempotency_key: "k"` or resend-ruby's
      # `options: { idempotency_key: "k" }`. No keyword parameters are declared
      # on purpose — Ruby 3 keyword separation would otherwise reject the
      # bare-keyword call shape.
      def send(params = {}, options = {})
        Millionsend::Request.new(
          method: :post, path: "/emails", body: params, **Millionsend::Util.request_options(options)
        ).perform
      end
      alias_method :create, :send

      # GET /emails/:id
      def get(id)
        Millionsend::Request.new(method: :get, path: member_path(id)).perform
      end

      # GET /emails — accepts limit:/after:/before:.
      def list(options = {})
        Millionsend::Request.new(method: :get, path: "/emails", query: Millionsend::Util.list_query(options)).perform
      end

      # PATCH /emails/:id — reschedule a scheduled, unsent email. Takes
      # (id, { scheduled_at: }) or resend-ruby's single hash with :email_id.
      def update(id, params = nil)
        if id.is_a?(Hash)
          params = id.reject { |k, _| k == :email_id }
          id = id[:email_id]
        end
        Millionsend::Request.new(method: :patch, path: member_path(id), body: params).perform
      end

      # GET /emails/:id/insights — the pre-send best-practice report computed
      # when the email was sent. 404 when the email is unknown or has no
      # insights yet. Check ids and band/severity/status values are an open
      # set that grows across score versions; they arrive as plain strings.
      def get_insights(id)
        Millionsend::Request.new(method: :get, path: "#{member_path(id)}/insights").perform
      end

      # POST /emails/:id/cancel — scheduled, unsent emails only.
      def cancel(id)
        Millionsend::Request.new(method: :post, path: "#{member_path(id)}/cancel").perform
      end

      # DELETE /emails/:id
      def remove(id)
        Millionsend::Request.new(method: :delete, path: member_path(id)).perform
      end

      private

      def member_path(id)
        "/emails/#{Millionsend::Util.encode(id)}"
      end
    end
  end
end
