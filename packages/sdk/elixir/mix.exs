defmodule MillionSend.MixProject do
  use Mix.Project

  @version "0.8.0"
  @source_url "https://github.com/MillionSend/millionsend-elixir"

  def project do
    [
      app: :millionsend,
      version: @version,
      elixir: "~> 1.15",
      elixirc_paths: elixirc_paths(Mix.env()),
      deps: deps(),
      description:
        "Official Elixir SDK for MillionSend — a self-hostable, Resend-compatible email API.",
      package: package(),
      name: "MillionSend",
      source_url: @source_url,
      docs: [main: "MillionSend", source_ref: "v#{@version}"]
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      {:req, "~> 0.5"},
      {:jason, "~> 1.4"},
      {:ex_doc, "~> 0.34", only: :dev, runtime: false},
      {:credo, "~> 1.7", only: :dev, runtime: false}
    ]
  end

  defp package do
    [
      licenses: ["MIT"],
      links: %{"GitHub" => @source_url},
      files: ~w(lib mix.exs README.md LICENSE .formatter.exs)
    ]
  end
end
