package io.github.tacklabs.posta;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.github.tacklabs.posta.model.Contact;
import io.github.tacklabs.posta.model.ContactAddress;
import io.github.tacklabs.posta.model.CreateContactOptions;
import io.github.tacklabs.posta.model.Id;
import io.github.tacklabs.posta.model.RemoveContactResponse;
import io.github.tacklabs.posta.model.UpdateContactOptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * End-to-end smoke test against a real Posta instance. Opt-in: runs only
 * when {@code POSTA_API_KEY} is set (and {@code POSTA_BASE_URL} for
 * a self-hosted instance). Exercises the contact lifecycle, which needs no verified
 * domain. Sending is not asserted here: it requires a verified sender domain.
 */
@EnabledIfEnvironmentVariable(named = "POSTA_API_KEY", matches = ".+")
class E2ETest {

  private final Posta ms = new Posta();

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
    PostaException e =
        assertThrows(
            PostaException.class,
            () -> ms.contacts().get(ContactAddress.email("does-not-exist@example.com")));
    assertEquals("not_found", e.getName());
  }
}
