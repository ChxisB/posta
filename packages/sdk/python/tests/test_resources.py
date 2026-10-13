"""Method + path + body + query mapping for every resource, over the mock layer."""

from urllib.parse import quote

import pytest

import millionsend


def test_emails_get_and_cancel(http):
    millionsend.Emails.get("e1")
    assert http.calls[0]["method"] == "GET"
    assert http.calls[0]["path"] == "/emails/e1"

    millionsend.Emails.cancel("e1")
    assert http.calls[1]["method"] == "POST"
    assert http.calls[1]["path"] == "/emails/e1/cancel"


def test_emails_get_score_present_and_null(http):
    http.body = {"object": "email", "id": "e1", "score": 8.5}
    assert millionsend.Emails.get("e1").score == 8.5

    http.body = {"object": "email", "id": "e1", "score": None}
    assert millionsend.Emails.get("e1").score is None


def test_emails_get_insights_full_shape(http):
    http.body = {
        "object": "email_insights",
        "email_id": "e1",
        "score": 8.5,
        "score_version": 1,
        "band": "excellent",
        "marketing": True,
        "html_size_bytes": 12345,
        "computed_at": "2026-08-31T00:00:00Z",
        "checks": [
            {
                "id": "list_unsubscribe",
                "severity": "major",
                "status": "fail",
                "penalty": 1.25,
                "detail": {"reason": "missing header"},
            },
            {"id": "plain_text_part", "severity": "minor", "status": "pass", "penalty": 0},
        ],
    }
    res = millionsend.Emails.get_insights("e1")
    assert http.calls[0]["method"] == "GET"
    assert http.calls[0]["path"] == "/emails/e1/insights"
    assert res.object == "email_insights"
    assert res.email_id == "e1"
    assert res.score == 8.5
    assert res.score_version == 1
    assert res.band == "excellent"
    assert res.marketing is True
    assert res.html_size_bytes == 12345
    assert res.computed_at == "2026-08-31T00:00:00Z"
    assert res.checks[0].id == "list_unsubscribe"
    assert res.checks[0].severity == "major"
    assert res.checks[0].status == "fail"
    assert res.checks[0].penalty == 1.25
    assert res.checks[0].detail.reason == "missing header"
    assert "detail" not in res.checks[1]
    # open enums: unknown future band/status values pass through untouched
    http.body = {
        "object": "email_insights",
        "band": "stellar",
        "checks": [{"id": "new_check_v9", "severity": "info", "status": "deferred", "penalty": 0}],
    }
    res = millionsend.Emails.get_insights("e1")
    assert res.band == "stellar"
    assert res.checks[0].status == "deferred"


def test_emails_get_insights_404(http):
    http.status = 404
    http.body = {"statusCode": 404, "name": "not_found", "message": "no insights"}
    with pytest.raises(millionsend.NotFoundError):
        millionsend.Emails.get_insights("e1")


def test_deliverability_get(http):
    http.body = {
        "object": "deliverability",
        "score": 8.7,
        "band": "good",
        "content_score": 8.2,
        "outcome_score": 9.1,
        "complaint_rate": 0.0002,
        "hard_bounce_rate": 0.001,
        "emails_sent": 12345,
        "scored_recipients": 23456,
        "window_days": 30,
        "insufficient_outcome_data": False,
        "guardrail_status": "ok",
        "score_version": 1,
    }
    res = millionsend.Deliverability.get()
    assert http.calls[0]["method"] == "GET"
    assert http.calls[0]["path"] == "/deliverability"
    assert res.score == 8.7
    assert res.band == "good"
    assert res.content_score == 8.2
    assert res.outcome_score == 9.1
    assert res.complaint_rate == 0.0002
    assert res.hard_bounce_rate == 0.001
    assert res.emails_sent == 12345
    assert res.scored_recipients == 23456
    assert res.window_days == 30
    assert res.insufficient_outcome_data is False
    assert res.guardrail_status == "ok"
    assert res.score_version == 1

    http.body = {"object": "deliverability", "score": None, "band": None, "guardrail_status": "paused"}
    res = millionsend.Deliverability.get()
    assert res.score is None
    assert res.band is None
    assert res.guardrail_status == "paused"


def test_emails_send_body_passthrough(http):
    millionsend.Emails.send(
        {
            "from": "a@x.dev",
            "to": ["b@x.dev"],
            "subject": "s",
            "html": "<p>h</p>",
            "reply_to": "r@x.dev",
            "scheduled_at": "2999-01-01T00:00:00Z",
        }
    )
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/emails"
    assert http.calls[0]["body"] == {
        "from": "a@x.dev",
        "to": ["b@x.dev"],
        "subject": "s",
        "html": "<p>h</p>",
        "reply_to": "r@x.dev",
        "scheduled_at": "2999-01-01T00:00:00Z",
    }


def test_batch_sends_bare_array_with_idempotency(http):
    http.body = {"data": [{"id": "1"}, {"id": "2"}]}
    res = millionsend.Batch.send(
        [
            {"from": "a@x.dev", "to": "b@x.dev", "subject": "1", "text": "one"},
            {"from": "a@x.dev", "to": "c@x.dev", "subject": "2", "text": "two"},
        ],
        idempotency_key="batch-1",
    )
    assert http.calls[0]["path"] == "/emails/batch"
    assert isinstance(http.calls[0]["body"], list)
    assert len(http.calls[0]["body"]) == 2
    assert http.calls[0]["headers"]["Idempotency-Key"] == "batch-1"
    assert len(res.data) == 2


def test_contacts_create(http):
    millionsend.Contacts.create({"email": "c@x.dev", "first_name": "Ada"})
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/contacts"
    assert http.calls[0]["body"] == {"email": "c@x.dev", "first_name": "Ada"}


def test_contacts_addressing(http):
    millionsend.Contacts.get("c1")
    assert http.calls[0]["path"] == "/contacts/c1"

    millionsend.Contacts.get(email="c@x.dev")
    assert http.calls[1]["path"] == "/contacts/" + quote("c@x.dev", safe="")

    millionsend.Contacts.get(id="c2")
    assert http.calls[2]["path"] == "/contacts/c2"

    millionsend.Contacts.remove(id="c2")
    assert http.calls[3]["method"] == "DELETE"
    assert http.calls[3]["path"] == "/contacts/c2"


def test_contacts_email_wins_over_id(http):
    millionsend.Contacts.get(contact_id="c1", email="c@x.dev")
    assert http.calls[0]["path"] == "/contacts/" + quote("c@x.dev", safe="")


def test_contacts_update_sends_only_provided_keys(http):
    millionsend.Contacts.update({"id": "c1", "first_name": None, "unsubscribed": True})
    assert http.calls[0]["method"] == "PATCH"
    assert http.calls[0]["path"] == "/contacts/c1"
    assert http.calls[0]["body"] == {"first_name": None, "unsubscribed": True}


def test_contacts_remove_and_list(http):
    millionsend.Contacts.remove(email="c@x.dev")
    assert http.calls[0]["method"] == "DELETE"
    assert http.calls[0]["params"] is None

    millionsend.Contacts.list(after="cur")
    assert http.calls[1]["path"] == "/contacts"
    assert http.calls[1]["params"] == {"after": "cur"}


def test_contacts_remove_erase(http):
    millionsend.Contacts.remove("c1", erase=True)
    assert http.calls[0]["method"] == "DELETE"
    assert http.calls[0]["path"] == "/contacts/c1"
    assert http.calls[0]["params"] == {"erase": "true"}

    millionsend.Contacts.remove(email="c@x.dev", erase=False)
    assert http.calls[1]["params"] is None


def test_contacts_list_include(http):
    http.body = {
        "object": "list",
        "has_more": False,
        "data": [
            {
                "id": "c1",
                "email": "c@x.dev",
                "properties": {"plan": {"type": "string", "value": "pro"}},
                "topics": [{"id": "t1", "name": "Insights", "subscription": "opt_in", "explicit": False}],
            }
        ],
    }
    res = millionsend.Contacts.list(limit=100, include=["properties", "topics"])
    assert http.calls[0]["path"] == "/contacts"
    assert http.calls[0]["params"] == {"limit": 100, "include": "properties,topics"}
    assert res.data[0].properties.plan.value == "pro"
    assert res.data[0].topics[0].subscription == "opt_in"

    millionsend.Contacts.list(segment_id="s1", include=["topics"])
    assert http.calls[1]["path"] == "/segments/s1/contacts"
    assert http.calls[1]["params"] == {"include": "topics"}

    millionsend.Contacts.list({"limit": 5, "include": ["properties"]})
    assert http.calls[2]["params"] == {"limit": 5, "include": "properties"}


def test_contacts_topics_list(http):
    http.body = {
        "object": "list",
        "has_more": False,
        "data": [
            {
                "id": "6f1d2c3e-0000-4000-8000-000000000001",
                "name": "Insights",
                "description": None,
                "subscription": "opt_in",
                "explicit": False,
                "visibility": "public",
            },
            {
                "id": "t2",
                "name": "Deals",
                "description": "Weekly",
                "subscription": "opt_out",
                "explicit": True,
            },
        ],
    }
    res = millionsend.Contacts.Topics.list(email="c@x.dev")
    assert http.calls[0]["method"] == "GET"
    assert http.calls[0]["path"] == "/contacts/" + quote("c@x.dev", safe="") + "/topics"
    assert http.calls[0]["params"] is None
    assert http.calls[0]["body"] is None
    assert res.object == "list"
    assert res.has_more is False
    assert res.data[0].id == "6f1d2c3e-0000-4000-8000-000000000001"
    assert res.data[0].name == "Insights"
    assert res.data[0].description is None
    assert res.data[0].subscription == "opt_in"
    assert res.data[0].explicit is False
    assert res.data[0].visibility == "public"
    assert res.data[1].description == "Weekly"
    assert res.data[1].subscription == "opt_out"
    assert res.data[1].explicit is True

    millionsend.Contacts.Topics.list("c1")
    assert http.calls[1]["path"] == "/contacts/c1/topics"
    millionsend.Contacts.Topics.list(id="c2")
    assert http.calls[2]["path"] == "/contacts/c2/topics"

    millionsend.Contacts.Topics.list("c1", None, {"limit": 5, "after": "cur"})
    assert http.calls[3]["params"] == {"limit": 5, "after": "cur"}
    millionsend.Contacts.Topics.list(email="c@x.dev", params={"limit": 5, "before": None})
    assert http.calls[4]["params"] == {"limit": 5}


def test_contacts_topics_update_bare_array(http):
    http.body = {"id": "c1"}
    millionsend.Contacts.Topics.update({"id": "c1", "topics": [{"id": "t1", "subscription": "opt_out"}]})
    assert http.calls[0]["method"] == "PATCH"
    assert http.calls[0]["path"] == "/contacts/c1/topics"
    assert http.calls[0]["body"] == [{"id": "t1", "subscription": "opt_out"}]


def test_broadcasts_lifecycle(http):
    millionsend.Broadcasts.create(
        {"segment_id": "s1", "from": "a@x.dev", "subject": "News", "html": "<p>hi</p>"}
    )
    assert http.calls[0]["path"] == "/broadcasts"
    assert http.calls[0]["body"] == {
        "segment_id": "s1",
        "from": "a@x.dev",
        "subject": "News",
        "html": "<p>hi</p>",
    }

    millionsend.Broadcasts.get("b1")
    assert http.calls[1]["path"] == "/broadcasts/b1"

    millionsend.Broadcasts.list()
    assert http.calls[2]["path"] == "/broadcasts"

    millionsend.Broadcasts.update("b1", {"subject": "New"})
    assert http.calls[3]["method"] == "PATCH"
    assert http.calls[3]["path"] == "/broadcasts/b1"

    millionsend.Broadcasts.send("b1", scheduled_at="2999-01-01T00:00:00Z")
    assert http.calls[4]["path"] == "/broadcasts/b1/send"
    assert http.calls[4]["body"] == {"scheduled_at": "2999-01-01T00:00:00Z"}

    millionsend.Broadcasts.send("b1")
    assert http.calls[5]["body"] == {}

    millionsend.Broadcasts.cancel("b1")
    assert http.calls[6]["path"] == "/broadcasts/b1/cancel"

    millionsend.Broadcasts.remove("b1")
    assert http.calls[7]["method"] == "DELETE"


def test_topics_crud(http):
    millionsend.Topics.create({"name": "Product", "default_subscription": "opt_in"})
    assert http.calls[0]["body"] == {"name": "Product", "default_subscription": "opt_in"}

    millionsend.Topics.get("t1")
    assert http.calls[1]["path"] == "/topics/t1"

    millionsend.Topics.list()
    assert http.calls[2]["path"] == "/topics"
    assert http.calls[2]["params"] is None

    millionsend.Topics.remove("t1")
    assert http.calls[3]["method"] == "DELETE"


def test_segments_crud(http):
    flt = {"match": "all", "conditions": [{"field": "email", "op": "is_set"}]}
    millionsend.Segments.create({"name": "Active", "filter": flt})
    assert http.calls[0]["path"] == "/segments"
    assert http.calls[0]["body"] == {"name": "Active", "filter": flt}

    millionsend.Segments.get("s1")
    assert http.calls[1]["path"] == "/segments/s1"

    millionsend.Segments.list(before="cur")
    assert http.calls[2]["path"] == "/segments"
    assert http.calls[2]["params"] == {"before": "cur"}

    millionsend.Segments.update("s1", {"name": "Renamed"})
    assert http.calls[3]["method"] == "PATCH"
    assert http.calls[3]["path"] == "/segments/s1"
    assert http.calls[3]["body"] == {"name": "Renamed"}

    millionsend.Segments.remove("s1")
    assert http.calls[4]["method"] == "DELETE"

    millionsend.Segments.create({"name": "Everyone"})
    assert http.calls[5]["body"] == {"name": "Everyone"}

    millionsend.Segments.update("s1", {"filter": None})
    assert http.calls[6]["body"] == {"filter": None}


def test_broadcasts_resend_dict_shape(http):
    millionsend.Broadcasts.update({"broadcast_id": "b1", "subject": "New", "topic_id": None})
    assert http.calls[0]["method"] == "PATCH"
    assert http.calls[0]["path"] == "/broadcasts/b1"
    assert http.calls[0]["body"] == {"subject": "New", "topic_id": None}

    millionsend.Broadcasts.send({"broadcast_id": "b1", "scheduled_at": "in 1 hour"})
    assert http.calls[1]["path"] == "/broadcasts/b1/send"
    assert http.calls[1]["body"] == {"scheduled_at": "in 1 hour"}

    millionsend.Broadcasts.send({"id": "b1"})
    assert http.calls[2]["body"] == {}

    with pytest.raises(ValueError):
        millionsend.Broadcasts.update({"subject": "no id"})
    assert len(http.calls) == 3


FULL_EMAIL = {
    "from": "Acme <a@x.dev>",
    "to": ["b@x.dev", "c@x.dev"],
    "subject": "s",
    "html": "<p>h</p>",
    "text": "t",
    "cc": ["cc@x.dev"],
    "bcc": "bcc@x.dev",
    "reply_to": ["r@x.dev"],
    "scheduled_at": "2999-01-01T00:00:00Z",
    "tags": [{"name": "category", "value": "welcome"}],
    "topic_id": "6f1d2c3e-0000-4000-8000-000000000001",
    "attachments": [
        {
            "filename": "hello.txt",
            "content": "aGVsbG8=",
            "content_type": "text/plain",
            "content_id": "hello-cid",
            "path": "https://x.dev/hello.txt",
        }
    ],
    "headers": {"X-Entity-Ref-ID": "123"},
    "template": {"id": "tpl_1", "variables": {"name": "Ada"}},
}


def test_emails_send_full_wire_body(http):
    millionsend.Emails.send(FULL_EMAIL)
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/emails"
    assert http.calls[0]["body"] == FULL_EMAIL

    cleared = dict(FULL_EMAIL, topic_id=None)
    millionsend.Batch.send([FULL_EMAIL, cleared])
    assert http.calls[1]["path"] == "/emails/batch"
    assert http.calls[1]["body"] == [FULL_EMAIL, cleared]


def test_batch_send_permissive_validation_and_typed_errors(http):
    http.body = {
        "data": [{"id": "1"}],
        "errors": [{"index": 1, "message": "emails.1: to is required"}],
    }
    res = millionsend.Batch.send(
        [
            {"from": "a@x.dev", "to": "b@x.dev", "subject": "1", "text": "one"},
            {"from": "a@x.dev", "subject": "2", "text": "two"},
        ],
        {"batch_validation": "permissive", "idempotency_key": "batch-2"},
    )
    assert http.calls[0]["headers"]["x-batch-validation"] == "permissive"
    assert http.calls[0]["headers"]["Idempotency-Key"] == "batch-2"
    assert res.data[0].id == "1"
    assert res.errors[0].index == 1
    assert res.errors[0].message == "emails.1: to is required"


def test_emails_list_update_remove(http):
    millionsend.Emails.list(limit=10, after="cur")
    assert http.calls[0]["method"] == "GET"
    assert http.calls[0]["path"] == "/emails"
    assert http.calls[0]["params"] == {"limit": 10, "after": "cur"}

    millionsend.Emails.update({"id": "e1", "scheduled_at": "2999-01-01T00:00:00Z"})
    assert http.calls[1]["method"] == "PATCH"
    assert http.calls[1]["path"] == "/emails/e1"
    assert http.calls[1]["body"] == {"scheduled_at": "2999-01-01T00:00:00Z"}

    millionsend.Emails.remove("e1")
    assert http.calls[2]["method"] == "DELETE"
    assert http.calls[2]["path"] == "/emails/e1"


def test_update_without_id_raises_before_any_request(http):
    with pytest.raises(ValueError):
        millionsend.Templates.update({"name": "x"})
    with pytest.raises(ValueError):
        millionsend.Webhooks.update({"webhook_id": None, "status": "disabled"})
    assert http.calls == []


def test_contacts_create_full_body(http):
    params = {
        "email": "c@x.dev",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "unsubscribed": False,
        "properties": {"plan": "pro", "seats": 3},
        "segments": [{"id": "s1"}],
        "topics": [{"id": "t1", "subscription": "opt_in"}],
    }
    millionsend.Contacts.create(params)
    assert http.calls[0]["body"] == params


def test_contacts_update_null_clears_names_and_properties(http):
    millionsend.Contacts.update(
        {"email": "c@x.dev", "first_name": None, "last_name": None, "properties": {"plan": None}}
    )
    assert http.calls[0]["path"] == "/contacts/" + quote("c@x.dev", safe="")
    assert http.calls[0]["body"] == {"first_name": None, "last_name": None, "properties": {"plan": None}}


def test_contacts_batch_create(http):
    http.body = {
        "data": [{"object": "contact", "index": 0, "id": "c1", "status": "created"}],
        "counts": {"created": 1, "updated": 0, "skipped": 0, "failed": 1},
        "errors": [{"index": 1, "message": "contacts.1: email is required"}],
    }
    items = [{"email": "a@x.dev", "first_name": "A"}, {"first_name": "no-email"}]
    res = millionsend.Contacts.Batch.create(items, on_conflict="upsert", batch_validation="permissive")
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/contacts/batch"
    assert http.calls[0]["params"] == {"on_conflict": "upsert"}
    assert http.calls[0]["headers"]["x-batch-validation"] == "permissive"
    assert http.calls[0]["body"] == items
    assert res.data[0].status == "created"
    assert res.counts.failed == 1
    assert res.errors[0].index == 1

    millionsend.Contacts.Batch.create(items)
    assert http.calls[1]["params"] is None
    assert "x-batch-validation" not in http.calls[1]["headers"]

    millionsend.Contacts.Batch.create(items, {"batch_validation": "strict"}, on_conflict="skip")
    assert http.calls[2]["params"] == {"on_conflict": "skip"}
    assert http.calls[2]["headers"]["x-batch-validation"] == "strict"


def test_contacts_batch_remove(http):
    http.body = {"data": [{"object": "contact", "contact": "c1", "deleted": True}]}
    res = millionsend.Contacts.Batch.remove({"ids": ["c1", "c2"]})
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/contacts/batch/remove"
    assert http.calls[0]["params"] is None
    assert http.calls[0]["body"] == {"ids": ["c1", "c2"]}
    assert res.data[0].contact == "c1"
    assert res.data[0].deleted is True

    millionsend.Contacts.Batch.remove({"emails": ["a@x.dev"]})
    assert http.calls[1]["path"] == "/contacts/batch/remove"
    assert http.calls[1]["body"] == {"emails": ["a@x.dev"]}

    params = {"ids": ["c1"]}
    millionsend.Contacts.Batch.remove(params, erase=True)
    assert http.calls[2]["body"] == {"ids": ["c1"], "erase": True}
    assert params == {"ids": ["c1"]}  # caller's dict untouched

    millionsend.Contacts.Batch.remove({"ids": ["c1"]}, erase=False)
    assert http.calls[3]["body"] == {"ids": ["c1"]}


def test_contacts_batch_get(http):
    http.body = {
        "object": "list",
        "data": [{"object": "contact", "id": "c1", "email": "a@x.dev", "topics": []}],
        "missing": [{"index": 1, "email": "ghost@x.dev"}, {"index": 2, "id": "c3"}],
    }
    res = millionsend.Contacts.Batch.get(["c1", {"email": "ghost@x.dev"}, {"id": "c3"}], include=["topics"])
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/contacts/batch/get"
    assert http.calls[0]["params"] is None
    assert http.calls[0]["body"] == {
        "contacts": [{"id": "c1"}, {"email": "ghost@x.dev"}, {"id": "c3"}],
        "include": ["topics"],
    }
    assert res.data[0].id == "c1"
    assert res.missing[0].index == 1
    assert res.missing[0].email == "ghost@x.dev"
    assert res.missing[1].id == "c3"

    millionsend.Contacts.Batch.get([{"email": "a@x.dev"}])
    assert http.calls[1]["body"] == {"contacts": [{"email": "a@x.dev"}]}


def test_contacts_preferences_link(http):
    http.body = {"object": "preferences_link", "contact": "c1", "url": "https://app.test/p?t=abc"}
    res = millionsend.Contacts.preferences_link("c1")
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/contacts/c1/preferences-link"
    assert http.calls[0]["body"] is None
    assert res.object == "preferences_link"
    assert res.contact == "c1"
    assert res.url == "https://app.test/p?t=abc"

    millionsend.Contacts.preferences_link(email="c@x.dev")
    assert http.calls[1]["path"] == "/contacts/" + quote("c@x.dev", safe="") + "/preferences-link"

    millionsend.Contacts.preferences_link(id="c2")
    assert http.calls[2]["path"] == "/contacts/c2/preferences-link"

    millionsend.Contacts.preferences_link(contact_id="c1", email="c@x.dev")
    assert http.calls[3]["path"] == "/contacts/" + quote("c@x.dev", safe="") + "/preferences-link"


def test_contacts_segments_add_remove(http):
    millionsend.Contacts.Segments.add({"contact_id": "c1", "segment_id": "s1"})
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/contacts/c1/segments/s1"
    assert http.calls[0]["body"] is None

    millionsend.Contacts.Segments.add({"id": "c1", "segment_id": "s1"})
    assert http.calls[1]["path"] == "/contacts/c1/segments/s1"

    millionsend.Contacts.Segments.remove({"email": "c@x.dev", "segment_id": "s1"})
    assert http.calls[2]["method"] == "DELETE"
    assert http.calls[2]["path"] == "/contacts/" + quote("c@x.dev", safe="") + "/segments/s1"


def test_contacts_list_by_segment(http):
    millionsend.Contacts.list(segment_id="s1", limit=5)
    assert http.calls[0]["path"] == "/segments/s1/contacts"
    assert http.calls[0]["params"] == {"limit": 5}

    millionsend.Contacts.list({"segment_id": "s1"})
    assert http.calls[1]["path"] == "/segments/s1/contacts"
    assert http.calls[1]["params"] is None

    millionsend.Contacts.list()
    assert http.calls[2]["path"] == "/contacts"
    assert http.calls[2]["params"] is None


def test_topics_update(http):
    millionsend.Topics.update("t1", {"name": "Renamed", "description": "d", "visibility": "public"})
    assert http.calls[0]["method"] == "PATCH"
    assert http.calls[0]["path"] == "/topics/t1"
    assert http.calls[0]["body"] == {"name": "Renamed", "description": "d", "visibility": "public"}


def test_broadcasts_full_body_and_null_clears_topic(http):
    params = {
        "name": "September",
        "segment_id": "s1",
        "from": "Acme <news@x.dev>",
        "subject": "News",
        "html": "<p>hi</p>",
        "text": "hi",
        "reply_to": ["r@x.dev"],
        "preview_text": "preheader",
        "topic_id": "t1",
        "send": True,
        "scheduled_at": "in 1 hour",
    }
    millionsend.Broadcasts.create(params)
    assert http.calls[0]["body"] == params

    millionsend.Broadcasts.update("b1", {"topic_id": None, "preview_text": "new"})
    assert http.calls[1]["body"] == {"topic_id": None, "preview_text": "new"}


def test_suppressions(http):
    millionsend.Suppressions.add({"email": "s@x.dev", "origin": "manual"})
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/suppressions"
    assert http.calls[0]["body"] == {"email": "s@x.dev", "origin": "manual"}

    millionsend.Suppressions.create({"email": "s@x.dev"})
    assert http.calls[1]["path"] == "/suppressions"
    assert http.calls[1]["body"] == {"email": "s@x.dev"}

    millionsend.Suppressions.get("s@x.dev")
    assert http.calls[2]["method"] == "GET"
    assert http.calls[2]["path"] == "/suppressions/" + quote("s@x.dev", safe="")

    millionsend.Suppressions.list(limit=10, origin="bounce")
    assert http.calls[3]["path"] == "/suppressions"
    assert http.calls[3]["params"] == {"limit": 10, "origin": "bounce"}

    millionsend.Suppressions.list()
    assert http.calls[4]["params"] is None

    millionsend.Suppressions.remove("sup_1")
    assert http.calls[5]["method"] == "DELETE"
    assert http.calls[5]["path"] == "/suppressions/sup_1"


def test_suppressions_batch(http):
    http.body = {"data": [{"object": "suppression", "id": "sup_1"}]}
    res = millionsend.Suppressions.Batch.add({"emails": ["a@x.dev", "b@x.dev"], "origin": "unsubscribe"})
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/suppressions/batch/add"
    assert http.calls[0]["body"] == {"emails": ["a@x.dev", "b@x.dev"], "origin": "unsubscribe"}
    assert res.data[0].id == "sup_1"

    millionsend.Suppressions.Batch.remove({"ids": ["sup_1"]})
    assert http.calls[1]["path"] == "/suppressions/batch/remove"
    assert http.calls[1]["body"] == {"ids": ["sup_1"]}

    millionsend.Suppressions.Batch.remove({"emails": ["a@x.dev"]})
    assert http.calls[2]["body"] == {"emails": ["a@x.dev"]}


def test_domains(http):
    params = {
        "name": "acme.dev",
        "region": "us-east-1",
        "custom_return_path": "bounce",
        "open_tracking": True,
        "click_tracking": False,
        "tracking_subdomain": "links",
    }
    millionsend.Domains.create(params)
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/domains"
    assert http.calls[0]["body"] == params

    millionsend.Domains.list(limit=5)
    assert http.calls[1]["method"] == "GET"
    assert http.calls[1]["path"] == "/domains"
    assert http.calls[1]["params"] == {"limit": 5}

    millionsend.Domains.get("d1")
    assert http.calls[2]["path"] == "/domains/d1"

    millionsend.Domains.verify("d1")
    assert http.calls[3]["method"] == "POST"
    assert http.calls[3]["path"] == "/domains/d1/verify"
    assert http.calls[3]["body"] is None

    update = {"open_tracking": True, "click_tracking": True, "tracking_subdomain": None, "tls": "enforced"}
    millionsend.Domains.update(dict(update, id="d1"))
    assert http.calls[4]["method"] == "PATCH"
    assert http.calls[4]["path"] == "/domains/d1"
    assert http.calls[4]["body"] == update

    millionsend.Domains.remove("d1")
    assert http.calls[5]["method"] == "DELETE"
    assert http.calls[5]["path"] == "/domains/d1"


def test_webhooks(http):
    http.body = {"object": "webhook", "id": "w1", "signing_secret": "whsec_abc"}
    params = {
        "endpoint": "https://x.dev/hook",
        "events": ["email.sent", "email.bounced"],
        "signing_secret": "whsec_abc",
    }
    res = millionsend.Webhooks.create(params)
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/webhooks"
    assert http.calls[0]["body"] == params
    assert res.signing_secret == "whsec_abc"

    millionsend.Webhooks.list(after="cur")
    assert http.calls[1]["path"] == "/webhooks"
    assert http.calls[1]["params"] == {"after": "cur"}

    millionsend.Webhooks.get("w1")
    assert http.calls[2]["method"] == "GET"
    assert http.calls[2]["path"] == "/webhooks/w1"

    millionsend.Webhooks.update({"webhook_id": "w1", "status": "disabled"})
    assert http.calls[3]["method"] == "PATCH"
    assert http.calls[3]["path"] == "/webhooks/w1"
    assert http.calls[3]["body"] == {"status": "disabled"}

    millionsend.Webhooks.update({"id": "w1", "endpoint": "https://x.dev/h2", "events": ["email.opened"]})
    assert http.calls[4]["path"] == "/webhooks/w1"
    assert http.calls[4]["body"] == {"endpoint": "https://x.dev/h2", "events": ["email.opened"]}

    millionsend.Webhooks.remove("w1")
    assert http.calls[5]["method"] == "DELETE"
    assert http.calls[5]["path"] == "/webhooks/w1"


def test_webhooks_rotate(http):
    http.body = {
        "object": "webhook",
        "id": "w1",
        "signing_secret": "whsec_new",
        "previous_secret_expires_at": "2026-01-02T00:00:00.000Z",
    }
    res = millionsend.Webhooks.rotate("w1")
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/webhooks/w1/rotate"
    assert http.calls[0]["headers"]["Content-Type"] == "application/json"
    assert http.calls[0]["body"] == {}
    assert res.signing_secret == "whsec_new"
    assert res.previous_secret_expires_at == "2026-01-02T00:00:00.000Z"

    millionsend.Webhooks.rotate("w1", {"signing_secret": "whsec_mine", "overlap_hours": 0})
    assert http.calls[1]["path"] == "/webhooks/w1/rotate"
    assert http.calls[1]["body"] == {"signing_secret": "whsec_mine", "overlap_hours": 0}

    millionsend.Webhooks.rotate("w1", {"overlap_hours": 72})
    assert http.calls[2]["body"] == {"overlap_hours": 72}


def test_api_keys(http):
    http.body = {"id": "k1", "token": "ms_secret"}
    res = millionsend.ApiKeys.create({"name": "ci", "permission": "sending_access", "domain_id": "d1"})
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/api-keys"
    assert http.calls[0]["body"] == {"name": "ci", "permission": "sending_access", "domain_id": "d1"}
    assert res.token == "ms_secret"

    millionsend.ApiKeys.list(limit=100)
    assert http.calls[1]["method"] == "GET"
    assert http.calls[1]["path"] == "/api-keys"
    assert http.calls[1]["params"] == {"limit": 100}

    millionsend.ApiKeys.remove("k1")
    assert http.calls[2]["method"] == "DELETE"
    assert http.calls[2]["path"] == "/api-keys/k1"


def test_templates(http):
    params = {
        "name": "Welcome",
        "html": "<p>{{{NAME}}}</p>",
        "subject": "Hi",
        "text": "hi",
        "alias": "welcome-v1",
        "from": "Acme <hi@x.dev>",
        "reply_to": ["r@x.dev"],
        "variables": [{"key": "NAME", "type": "string"}],
    }
    millionsend.Templates.create(params)
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/templates"
    assert http.calls[0]["body"] == params

    millionsend.Templates.get("welcome-v1")
    assert http.calls[1]["method"] == "GET"
    assert http.calls[1]["path"] == "/templates/welcome-v1"

    millionsend.Templates.list(before="cur")
    assert http.calls[2]["path"] == "/templates"
    assert http.calls[2]["params"] == {"before": "cur"}

    millionsend.Templates.update(
        {"id": "welcome-v1", "alias": None, "subject": None, "text": None, "html": "<p>x</p>"}
    )
    assert http.calls[3]["method"] == "PATCH"
    assert http.calls[3]["path"] == "/templates/welcome-v1"
    assert http.calls[3]["body"] == {"alias": None, "subject": None, "text": None, "html": "<p>x</p>"}

    millionsend.Templates.publish("tpl_1")
    assert http.calls[4]["method"] == "POST"
    assert http.calls[4]["path"] == "/templates/tpl_1/publish"

    millionsend.Templates.duplicate("tpl_1")
    assert http.calls[5]["method"] == "POST"
    assert http.calls[5]["path"] == "/templates/tpl_1/duplicate"

    millionsend.Templates.remove("tpl_1")
    assert http.calls[6]["method"] == "DELETE"
    assert http.calls[6]["path"] == "/templates/tpl_1"


def test_contact_properties(http):
    millionsend.ContactProperties.create({"key": "plan", "type": "string", "fallback_value": "free"})
    assert http.calls[0]["method"] == "POST"
    assert http.calls[0]["path"] == "/contact-properties"
    assert http.calls[0]["body"] == {"key": "plan", "type": "string", "fallback_value": "free"}

    millionsend.ContactProperties.list(limit=20)
    assert http.calls[1]["method"] == "GET"
    assert http.calls[1]["path"] == "/contact-properties"
    assert http.calls[1]["params"] == {"limit": 20}

    millionsend.ContactProperties.get("p1")
    assert http.calls[2]["path"] == "/contact-properties/p1"

    millionsend.ContactProperties.update({"id": "p1", "fallback_value": None})
    assert http.calls[3]["method"] == "PATCH"
    assert http.calls[3]["path"] == "/contact-properties/p1"
    assert http.calls[3]["body"] == {"fallback_value": None}

    millionsend.ContactProperties.remove("p1")
    assert http.calls[4]["method"] == "DELETE"
    assert http.calls[4]["path"] == "/contact-properties/p1"


def test_usage_get(http):
    http.body = {
        "object": "usage",
        "cloud": True,
        "plan": "pro",
        "limits": {"emails_per_day": 10000, "domains": 10},
        "today": {"emails_sent": 12, "resets_at": "2026-09-05T00:00:00Z"},
        "team": {"id": "team_1", "name": "Acme"},
        "app_url": None,
    }
    res = millionsend.Usage.get()
    assert http.calls[0]["method"] == "GET"
    assert http.calls[0]["path"] == "/usage"
    assert res.limits.emails_per_day == 10000
    assert res.today.emails_sent == 12
    assert res.app_url is None
