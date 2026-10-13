package com.millionsend;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * A throwaway loopback HTTP server that records the last request it received and
 * replies with a canned status + body. Exercises the real {@link com.millionsend.core.HttpClient}
 * wire path (headers, JSON serialization) with no mocking framework — just the JDK's
 * {@code com.sun.net.httpserver}.
 */
final class MockServer implements AutoCloseable {

  private final HttpServer server;

  int status = 200;
  String responseBody = "{\"id\":\"id_1\"}";

  volatile String method;
  volatile String path;
  /** The undecoded request path, so percent-encoding itself can be asserted. */
  volatile String rawPath;
  volatile String query;
  volatile String body;
  volatile Headers headers;

  MockServer() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/",
        exchange -> {
          method = exchange.getRequestMethod();
          URI uri = exchange.getRequestURI();
          path = uri.getPath();
          rawPath = uri.getRawPath();
          query = uri.getRawQuery();
          headers = exchange.getRequestHeaders();
          body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
          byte[] out = responseBody.getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().set("Content-Type", "application/json");
          exchange.sendResponseHeaders(status, out.length);
          try (OutputStream os = exchange.getResponseBody()) {
            os.write(out);
          }
        });
    server.start();
  }

  String baseUrl() {
    return "http://127.0.0.1:" + server.getAddress().getPort();
  }

  MillionSend client() {
    return new MillionSend("ms_test", baseUrl());
  }

  String header(String name) {
    return headers == null ? null : headers.getFirst(name);
  }

  @Override
  public void close() {
    server.stop(0);
  }
}
