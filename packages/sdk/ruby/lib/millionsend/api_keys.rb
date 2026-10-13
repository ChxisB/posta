# frozen_string_literal: true

module Millionsend
  # API keys. The token is only ever returned by create.
  module ApiKeys
    class << self
      # POST /api-keys — name, permission ("full_access" default or
      # "sending_access"), domain_id. Returns { id:, token: }.
      def create(params)
        Millionsend::Request.new(method: :post, path: "/api-keys", body: params).perform
      end

      # GET /api-keys — accepts limit:/after:/before:.
      def list(options = {})
        Millionsend::Request.new(method: :get, path: "/api-keys", query: Millionsend::Util.list_query(options)).perform
      end

      # DELETE /api-keys/:id
      def remove(id)
        Millionsend::Request.new(method: :delete, path: "/api-keys/#{Millionsend::Util.encode(id)}").perform
      end
    end
  end
end
