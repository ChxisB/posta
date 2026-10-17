# frozen_string_literal: true

module Posta
  # Broadcasts: one email sent to a segment, a topic's subscribers, or every
  # contact (pass neither segment_id nor topic_id).
  module Broadcasts
    class << self
      # POST /broadcasts
      def create(params)
        Posta::Request.new(method: :post, path: "/broadcasts", body: params).perform
      end

      # GET /broadcasts/:id
      def get(id)
        Posta::Request.new(method: :get, path: "/broadcasts/#{Posta::Util.encode(id)}").perform
      end

      # GET /broadcasts: accepts limit:/after:/before:.
      def list(options = {})
        Posta::Request.new(
          method: :get, path: "/broadcasts", query: Posta::Util.list_query(options)
        ).perform
      end

      # PATCH /broadcasts/:id: draft only.
      def update(id, params)
        Posta::Request.new(method: :patch, path: "/broadcasts/#{Posta::Util.encode(id)}", body: params).perform
      end

      # DELETE /broadcasts/:id: draft only.
      def remove(id)
        Posta::Request.new(method: :delete, path: "/broadcasts/#{Posta::Util.encode(id)}").perform
      end

      # POST /broadcasts/:id/send: pass scheduled_at: to schedule, omit to send now.
      def send(id, params = {})
        Posta::Request.new(method: :post, path: "/broadcasts/#{Posta::Util.encode(id)}/send", body: params).perform
      end

      # POST /broadcasts/:id/cancel: scheduled only.
      def cancel(id)
        Posta::Request.new(method: :post, path: "/broadcasts/#{Posta::Util.encode(id)}/cancel").perform
      end
    end
  end
end
