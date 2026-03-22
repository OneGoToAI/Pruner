# This formula lives in the OneGoToAI/homebrew-tap repository.
# Copy it there; it is automatically kept in sync by the release GitHub Action.
#
# Install: brew install OneGoToAI/tap/pruner
#
# Binaries are served from the public OneGoToAI/pruner-releases repo.
# Source code lives in the private OneGoToAI/Pruner repo and is not exposed.
class Pruner < Formula
  desc "Zero-config cost optimizer for Claude CLI"
  homepage "https://github.com/OneGoToAI/pruner-releases"
  version "0.1.0"
  license :cannot_represent

  on_macos do
    on_arm do
      url "https://github.com/OneGoToAI/pruner-releases/releases/download/v#{version}/pruner-darwin-arm64"
      sha256 "PLACEHOLDER_ARM64_SHA256"

      def install
        bin.install "pruner-darwin-arm64" => "pruner"
      end
    end

    on_intel do
      url "https://github.com/OneGoToAI/pruner-releases/releases/download/v#{version}/pruner-darwin-x64"
      sha256 "PLACEHOLDER_X64_SHA256"

      def install
        bin.install "pruner-darwin-x64" => "pruner"
      end
    end
  end

  test do
    # Binary should at least start and fail cleanly when 'claude' is not installed
    output = shell_output("#{bin}/pruner 2>&1", 1)
    assert_match "pruner", output.downcase
  end
end
