# frozen_string_literal: true

module Millionsend
  # Typed custom properties for contacts. key and type are fixed at creation;
  # only fallback_value can change.
  module ContactProperties
    class << self
      # POST /contact-properties — key, type ("string"/"number"), fallback_value.
      def create(params)
        Millionsend::Request.new(method: :post, path: "/contact-properties", body: params).perform
      end

      # GET /contact-properties/:id
      def get(id)
        Millionsend::Request.new(method: :get, path: member_path(id)).perform
      end

      # GET /contact-properties — accepts limit:/after:/before:.
      def list(options = {})
        Millionsend::Request.new(
          method: :get, path: "/contact-properties", query: Millionsend::Util.list_query(options)
        ).perform
      end

      # PATCH /contact-properties/:id — fallback_value (nil clears it).
      def update(id, params)
        Millionsend::Request.new(method: :patch, path: member_path(id), body: params).perform
      end

      # DELETE /contact-properties/:id
      def remove(id)
        Millionsend::Request.new(method: :delete, path: member_path(id)).perform
      end

      private

      def member_path(id)
        "/contact-properties/#{Millionsend::Util.encode(id)}"
      end
    end
  end
end
