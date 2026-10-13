# frozen_string_literal: true

module Millionsend
  # Dynamic segments — a saved filter over the team's contacts. A MillionSend
  # extension with no Resend equivalent.
  module Segments
    class << self
      # POST /segments
      def create(params)
        Millionsend::Request.new(method: :post, path: "/segments", body: params).perform
      end

      # GET /segments/:id — also returns a live contact_count.
      def get(id)
        Millionsend::Request.new(method: :get, path: "/segments/#{Millionsend::Util.encode(id)}").perform
      end

      # GET /segments — accepts limit:/after:/before:.
      def list(options = {})
        Millionsend::Request.new(
          method: :get, path: "/segments", query: Millionsend::Util.list_query(options)
        ).perform
      end

      # GET /segments/:id/contacts — the contacts currently matching, paginated
      # with limit:/after:/before:; include: (["properties", "topics"]) as on
      # Contacts.list.
      def contacts(id, options = {})
        query = Millionsend::Util.list_query(options).merge(include: Millionsend::Util.include_query(options[:include]))
        Millionsend::Request.new(
          method: :get, path: "/segments/#{Millionsend::Util.encode(id)}/contacts", query: query
        ).perform
      end

      # PATCH /segments/:id
      def update(id, params)
        Millionsend::Request.new(method: :patch, path: "/segments/#{Millionsend::Util.encode(id)}", body: params).perform
      end

      # DELETE /segments/:id
      def remove(id)
        Millionsend::Request.new(method: :delete, path: "/segments/#{Millionsend::Util.encode(id)}").perform
      end
    end
  end
end
