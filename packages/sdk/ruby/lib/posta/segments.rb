# frozen_string_literal: true

module Posta
  # Dynamic segments — a saved filter over the team's contacts. A Posta
  # extension with no Resend equivalent.
  module Segments
    class << self
      # POST /segments
      def create(params)
        Posta::Request.new(method: :post, path: "/segments", body: params).perform
      end

      # GET /segments/:id — also returns a live contact_count.
      def get(id)
        Posta::Request.new(method: :get, path: "/segments/#{Posta::Util.encode(id)}").perform
      end

      # GET /segments — accepts limit:/after:/before:.
      def list(options = {})
        Posta::Request.new(
          method: :get, path: "/segments", query: Posta::Util.list_query(options)
        ).perform
      end

      # GET /segments/:id/contacts — the contacts currently matching, paginated
      # with limit:/after:/before:; include: (["properties", "topics"]) as on
      # Contacts.list.
      def contacts(id, options = {})
        query = Posta::Util.list_query(options).merge(include: Posta::Util.include_query(options[:include]))
        Posta::Request.new(
          method: :get, path: "/segments/#{Posta::Util.encode(id)}/contacts", query: query
        ).perform
      end

      # PATCH /segments/:id
      def update(id, params)
        Posta::Request.new(method: :patch, path: "/segments/#{Posta::Util.encode(id)}", body: params).perform
      end

      # DELETE /segments/:id
      def remove(id)
        Posta::Request.new(method: :delete, path: "/segments/#{Posta::Util.encode(id)}").perform
      end
    end
  end
end
