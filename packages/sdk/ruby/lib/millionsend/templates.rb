# frozen_string_literal: true

module Millionsend
  # Email templates, addressable by id or alias. Templates are always
  # published: publish is kept as a no-op for resend-ruby compatibility.
  module Templates
    class << self
      # POST /templates — name, html, subject, text, alias.
      def create(params)
        Millionsend::Request.new(method: :post, path: "/templates", body: params).perform
      end

      # GET /templates/:id_or_alias
      def get(id_or_alias)
        Millionsend::Request.new(method: :get, path: member_path(id_or_alias)).perform
      end

      # GET /templates — accepts limit:/after:/before:.
      def list(options = {})
        Millionsend::Request.new(method: :get, path: "/templates", query: Millionsend::Util.list_query(options)).perform
      end

      # PATCH /templates/:id_or_alias — name, html, subject, text, alias; nil
      # clears subject/text/alias.
      def update(id_or_alias, params)
        Millionsend::Request.new(method: :patch, path: member_path(id_or_alias), body: params).perform
      end

      # POST /templates/:id_or_alias/publish
      def publish(id_or_alias)
        Millionsend::Request.new(method: :post, path: "#{member_path(id_or_alias)}/publish").perform
      end

      # POST /templates/:id_or_alias/duplicate — returns the copy's id.
      def duplicate(id_or_alias)
        Millionsend::Request.new(method: :post, path: "#{member_path(id_or_alias)}/duplicate").perform
      end

      # DELETE /templates/:id_or_alias
      def remove(id_or_alias)
        Millionsend::Request.new(method: :delete, path: member_path(id_or_alias)).perform
      end

      private

      def member_path(id_or_alias)
        "/templates/#{Millionsend::Util.encode(id_or_alias)}"
      end
    end
  end
end
