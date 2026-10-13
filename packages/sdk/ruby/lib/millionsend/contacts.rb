# frozen_string_literal: true

module Millionsend
  # Contacts are team-global and addressable by id or by email (email wins when
  # an update hash carries both).
  module Contacts
    class << self
      # POST /contacts — email, first_name, last_name, unsubscribed, properties,
      # segments: [{ id: }], topics: [{ id:, subscription: }].
      def create(params)
        Millionsend::Request.new(method: :post, path: "/contacts", body: params).perform
      end

      # GET a single contact by id or email.
      def get(id_or_email)
        Millionsend::Request.new(method: :get, path: member_path(id_or_email)).perform
      end

      # PATCH a contact. Addressing keys (:id, :email) are pulled out;
      # everything else is the body. A nil value clears a field; omit a key to
      # leave it unchanged.
      def update(params)
        body = params.reject { |k, _| %i[id email].include?(k) }
        Millionsend::Request.new(method: :patch, path: member_path(params), body: body).perform
      end

      # DELETE a contact by id or email. The contact's emails stay in the send
      # log; erase: true also scrubs the address from email history, event
      # payloads and API logs (a GDPR/LGPD erasure). The flag rides flat or in
      # resend-ruby's addressing hash: remove(email: "a@x.dev", erase: true).
      def remove(id_or_email, options = {})
        erase = options.key?(:erase) ? options[:erase] : (id_or_email[:erase] if id_or_email.is_a?(Hash))
        Millionsend::Request.new(method: :delete, path: member_path(id_or_email), query: { erase: erase }).perform
      end

      # GET /contacts — accepts limit:/after:/before: and include:
      # (["properties", "topics"]) to carry the property map and the topic
      # subscriptions on every item, as Contacts.get and Topics.list return them.
      def list(options = {})
        query = Millionsend::Util.list_query(options).merge(include: Millionsend::Util.include_query(options[:include]))
        Millionsend::Request.new(method: :get, path: "/contacts", query: query).perform
      end

      # PATCH /contacts/:id_or_email/topics with a bare array of
      # { id:, subscription: }. Contacts::Topics.update is the resend-ruby shape.
      def topics_update(id_or_email, topics)
        Millionsend::Request.new(method: :patch, path: "#{member_path(id_or_email)}/topics", body: topics).perform
      end

      # POST /contacts/:id_or_email/preferences-link — the contact's hosted
      # preference page, { object: "preferences_link", contact:, url: }. The
      # url is a contact-scoped capability with no expiry: hand it only to that
      # contact. 422 when the instance cannot build hosted links.
      def preferences_link(id_or_email)
        Millionsend::Request.new(method: :post, path: "#{member_path(id_or_email)}/preferences-link").perform
      end

      # Every member method also accepts resend-ruby's addressing hash
      # ({ id: } / { email: } / { contact_id: }) in place of the bare value.
      def member_path(id_or_email)
        "/contacts/#{Millionsend::Util.encode(unwrap(id_or_email))}"
      end

      # One /contacts/batch/get entry. The wire wants { id: } and { email: }
      # told apart, and only an email carries "@".
      def address(id_or_email)
        value = unwrap(id_or_email)
        value.to_s.include?("@") ? { email: value } : { id: value }
      end

      private

      def unwrap(id_or_email)
        id_or_email.is_a?(Hash) ? id_or_email[:email] || id_or_email[:id] || id_or_email[:contact_id] : id_or_email
      end
    end

    # Topic subscriptions of one contact, in resend-ruby's nested shape.
    module Topics
      class << self
        # GET /contacts/:id_or_email/topics — { id: | email: } or a bare id/email.
        # Every topic comes back with the contact's effective subscription
        # (explicit: false means it is the topic's default, not a stored
        # choice) and its visibility ("public" | "private"). Unpaginated, like
        # Topics.list.
        def list(params)
          Millionsend::Request.new(method: :get, path: "#{Millionsend::Contacts.member_path(params)}/topics").perform
        end

        # PATCH /contacts/:id_or_email/topics — { id: | email:, topics: [{ id:, subscription: }] }.
        def update(params)
          Millionsend::Contacts.topics_update(params, params[:topics])
        end
      end
    end

    # Bulk contact creation and deletion — MillionSend extensions (Resend
    # imports via CSV and deletes one at a time).
    module Batch
      class << self
        # POST /contacts/batch with a bare array of up to 1000 create payloads.
        # Options (flat or under options:): on_conflict ("error" default,
        # "skip", "upsert") for emails that already belong to a contact,
        # batch_validation ("strict" default, "permissive" writes the valid
        # subset and lists failures under errors[]), idempotency_key. Returns
        # { data: [{ index:, id:, status: }], counts: {...}, errors: [...] }.
        def create(list, options = {})
          options = options[:options] if options.is_a?(Hash) && options.key?(:options)
          Millionsend::Request.new(
            method: :post, path: "/contacts/batch", body: list,
            query: { on_conflict: options[:on_conflict] },
            **Millionsend::Util.request_options(options)
          ).perform
        end

        # POST /contacts/batch/get — up to 1000 contacts by id or email (bare
        # values or addressing hashes, like Contacts.get) in one request, one
        # call against the rate limit. Returns { data: [...] } in request order
        # plus missing: [{ index:, id: | email: }] for the entries that matched
        # nobody — those never fail the call. include: ["properties", "topics"]
        # attaches the same extras as Contacts.list.
        def get(addresses, options = {})
          body = { contacts: addresses.map { |a| Millionsend::Contacts.address(a) }, include: options[:include] }
          Millionsend::Request.new(method: :post, path: "/contacts/batch/get", body: body.compact).perform
        end

        # POST /contacts/batch/remove — { ids: [...] } or { emails: [...] }
        # (exactly one, up to 1000), plus erase: true to also scrub each
        # address from email history, event payloads and API logs, as
        # Contacts.remove does. Returns { data: [{ object:, contact:,
        # deleted: true }] } listing only the rows actually deleted; unknown
        # ids or addresses are skipped.
        def remove(params)
          Millionsend::Request.new(method: :post, path: "/contacts/batch/remove", body: params).perform
        end
      end
    end

    # Segment membership of one contact. Segments are dynamic filters, so this
    # only applies to segments that hold an explicit member list.
    module Segments
      class << self
        # POST /contacts/:id_or_email/segments/:segment_id. Takes
        # (id_or_email, segment_id) or resend-ruby's { contact_id: | email:, segment_id: }.
        def add(id_or_email, segment_id = nil)
          Millionsend::Request.new(method: :post, path: path(id_or_email, segment_id)).perform
        end

        # DELETE /contacts/:id_or_email/segments/:segment_id — same shapes as add.
        def remove(id_or_email, segment_id = nil)
          Millionsend::Request.new(method: :delete, path: path(id_or_email, segment_id)).perform
        end

        private

        def path(id_or_email, segment_id)
          segment_id ||= id_or_email[:segment_id] if id_or_email.is_a?(Hash)
          "#{Millionsend::Contacts.member_path(id_or_email)}/segments/#{Millionsend::Util.encode(segment_id)}"
        end
      end
    end
  end
end
