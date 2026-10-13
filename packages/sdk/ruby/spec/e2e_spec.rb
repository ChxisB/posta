# frozen_string_literal: true

# Opt-in end-to-end smoke test against a real Posta instance. The whole
# group only runs when POSTA_API_KEY is set; otherwise it is skipped. Set
# POSTA_BASE_URL too for a self-hosted instance (the default is Posta
# Cloud). It exercises the contact lifecycle, which needs no verified sender
# domain.
#
#   POSTA_API_KEY=po_... POSTA_BASE_URL=http://localhost:3001 \
#     bundle exec rspec spec/e2e_spec.rb
RSpec.describe "e2e: contacts lifecycle", :e2e, if: ENV["POSTA_API_KEY"] do
  before(:all) do
    WebMock.allow_net_connect!
    Posta.api_key = ENV["POSTA_API_KEY"]
    Posta.base_url = ENV["POSTA_BASE_URL"]
  end

  after(:all) do
    WebMock.disable_net_connect!
  end

  it "creates, reads, updates and deletes a contact" do
    email = "sdk-e2e-#{Time.now.to_i}@example.com"
    created = Posta::Contacts.create(email: email, first_name: "Ada")
    expect(created[:id]).not_to be_nil

    fetched = Posta::Contacts.get(email)
    expect(fetched[:email]).to eq(email)
    expect(fetched[:first_name]).to eq("Ada")

    Posta::Contacts.update(email: email, unsubscribed: true)

    removed = Posta::Contacts.remove(email)
    expect(removed[:deleted]).to eq(true)
  end

  it "raises not_found for a missing contact" do
    expect { Posta::Contacts.get("does-not-exist@example.com") }
      .to raise_error(Posta::NotFoundError)
  end
end
