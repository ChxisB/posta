package com.millionsend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.millionsend.model.Contact;
import com.millionsend.model.ContactAddress;
import com.millionsend.model.CreateContactOptions;
import com.millionsend.model.Id;
import com.millionsend.model.RemoveContactResponse;
import com.millionsend.model.UpdateContactOptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * End-to-end smoke test against a real MillionSend instance. Opt-in: runs only
 * when {@code MILLIONSEND_API_KEY} is set (and {@code MILLIONSEND_BASE_URL} for
 * a self-hosted instance). Exercises the contact lifecycle, which needs no verified
 * domain. Sending is not asserted here — it requires a verified sender domain.
 */
@EnabledIfEnvironmentVariable(named = "MILLIONSEND_API_KEY", matches = ".+")
class E2ETest {

  private final MillionSend ms = new MillionSend();

  @Test
  void contactLifecycle() throws Exception {
    String email = "sdk-e2e-" + System.currentTimeMillis() + "@example.com";

    Id created =
        ms.contacts().create(CreateContactOptions.builder().email(email).firstName("Ada").build());
    assertNotNull(created.getId());

    try {
      Contact fetched = ms.contacts().get(ContactAddress.email(email));
      assertEquals(email, fetched.getEmail());
      assertEquals("Ada", fetched.getFirstName());

      ms.contacts().update(UpdateContactOptions.builder().email(email).unsubscribed(true).build());
    } finally {
      RemoveContactResponse removed = ms.contacts().remove(ContactAddress.email(email));
      assertTrue(removed.getDeleted());
    }
  }

  @Test
  void surfacesNotFoundWithoutSpecialCasing() {
    MillionSendException e =
        assertThrows(
            MillionSendException.class,
            () -> ms.contacts().get(ContactAddress.email("does-not-exist@example.com")));
    assertEquals("not_found", e.getName());
  }
}
