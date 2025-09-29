# Contributing to Axiom AI

We love your input! We want to make contributing to Axiom AI as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## Pull Requests

Pull requests are the best way to propose changes to the codebase. We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/axiom-ai.git
cd axiom-ai

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start development environment
docker-compose up -d

# Run tests
npm test
```

## Code Style

* Use TypeScript for all new code
* Follow the existing code style
* Use meaningful variable names
* Add comments for complex logic
* Write tests for new features

## Testing

* Write unit tests for new functionality
* Ensure all tests pass before submitting PR
* Include integration tests for API endpoints
* Test MCP integration scenarios

## Security

* Never commit secrets or API keys
* Use environment variables for configuration
* Follow security best practices
* Report security issues privately

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue or reach out to the maintainers!
