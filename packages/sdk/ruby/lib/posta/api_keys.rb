# frozen_string_literal: true

module Posta
  # API keys. The token is only ever returned by create.
  module ApiKeys
    class << self
      # POST /api-keys: name, permission ("full_access" default or
      # "sending_access"), domain_id. Returns { id:, token: }.
      def create(params)
        Posta::Request.new(method: :post, path: "/api-keys", body: params).perform
      end

      # GET /api-keys: accepts limit:/after:/before:.
      def list(options = {})
        Posta::Request.new(method: :get, path: "/api-keys", query: Posta::Util.list_query(options)).perform
      end

      # DELETE /api-keys/:id
      def remove(id)
        Posta::Request.new(method: :delete, path: "/api-keys/#{Posta::Util.encode(id)}").perform
      end
    end
  end
end
