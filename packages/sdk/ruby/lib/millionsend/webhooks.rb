# frozen_string_literal: true

module Millionsend
  # Webhook endpoints. The signing secret is returned on create and on get.
  module Webhooks
    class << self
      # POST /webhooks — endpoint, events[], signing_secret (optional; pass an
      # existing whsec_ value to keep a receiver verifying unchanged).
      def create(params)
        Millionsend::Request.new(method: :post, path: "/webhooks", body: params).perform
      end

      # GET /webhooks/:id — includes signing_secret and
      # previous_secret_expires_at (nil unless a rotation's overlap window is open).
      def get(id)
        Millionsend::Request.new(method: :get, path: member_path(id)).perform
      end

      # GET /webhooks — accepts limit:/after:/before:.
      def list(options = {})
        Millionsend::Request.new(method: :get, path: "/webhooks", query: Millionsend::Util.list_query(options)).perform
      end

      # PATCH /webhooks/:id — endpoint, events, status ("enabled"/"disabled").
      def update(id, params)
        Millionsend::Request.new(method: :patch, path: member_path(id), body: params).perform
      end

      # DELETE /webhooks/:id
      def remove(id)
        Millionsend::Request.new(method: :delete, path: member_path(id)).perform
      end

      # POST /webhooks/:id/rotate — signing_secret (optional whsec_ value to
      # bring your own; omitted mints one) and overlap_hours (0..72, default
      # 24) during which deliveries carry both signatures. Returns { object:,
      # id:, signing_secret:, previous_secret_expires_at: }.
      def rotate(id, params = {})
        Millionsend::Request.new(method: :post, path: "#{member_path(id)}/rotate", body: params).perform
      end

      private

      def member_path(id)
        "/webhooks/#{Millionsend::Util.encode(id)}"
      end
    end
  end
end
