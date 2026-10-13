# frozen_string_literal: true

module Millionsend
  # Broadcasts — one email sent to a segment, a topic's subscribers, or every
  # contact (pass neither segment_id nor topic_id).
  module Broadcasts
    class << self
      # POST /broadcasts
      def create(params)
        Millionsend::Request.new(method: :post, path: "/broadcasts", body: params).perform
      end

      # GET /broadcasts/:id
      def get(id)
        Millionsend::Request.new(method: :get, path: "/broadcasts/#{Millionsend::Util.encode(id)}").perform
      end

      # GET /broadcasts — accepts limit:/after:/before:.
      def list(options = {})
        Millionsend::Request.new(
          method: :get, path: "/broadcasts", query: Millionsend::Util.list_query(options)
        ).perform
      end

      # PATCH /broadcasts/:id — draft only.
      def update(id, params)
        Millionsend::Request.new(method: :patch, path: "/broadcasts/#{Millionsend::Util.encode(id)}", body: params).perform
      end

      # DELETE /broadcasts/:id — draft only.
      def remove(id)
        Millionsend::Request.new(method: :delete, path: "/broadcasts/#{Millionsend::Util.encode(id)}").perform
      end

      # POST /broadcasts/:id/send — pass scheduled_at: to schedule, omit to send now.
      def send(id, params = {})
        Millionsend::Request.new(method: :post, path: "/broadcasts/#{Millionsend::Util.encode(id)}/send", body: params).perform
      end

      # POST /broadcasts/:id/cancel — scheduled only.
      def cancel(id)
        Millionsend::Request.new(method: :post, path: "/broadcasts/#{Millionsend::Util.encode(id)}/cancel").perform
      end
    end
  end
end
