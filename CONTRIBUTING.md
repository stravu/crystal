# Contributing to Crystal

Thank you for your interest in contributing to Crystal! We welcome contributions from the community and are excited to work with you.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment:
   ```bash
   pnpm run setup
   ```
4. Create a new branch for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Process

### Running in Development

```bash
# Run the Electron app in development mode
pnpm run electron-dev

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### Code Style

- We use TypeScript for type safety
- Code is formatted with Prettier (runs automatically on commit)
- ESLint is used for code quality
- Follow the existing code style and patterns

### Project Structure

```
crystal/
├── frontend/         # React renderer process
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── stores/      # Zustand state stores
│   │   └── utils/       # Utility functions
├── main/            # Electron main process
│   ├── src/
│   │   ├── database/    # SQLite database
│   │   ├── services/    # Business logic
│   │   └── utils/       # Utilities
└── shared/          # Shared types between processes
```

## Making Changes

### Before You Start

1. Check existing issues to avoid duplicates
2. For significant changes, open an issue first to discuss
3. Ensure your branch is up to date with main

### Commit Guidelines

- Write clear, concise commit messages
- Use present tense ("Add feature" not "Added feature")
- Reference issues when applicable (#123)
- Keep commits focused and atomic

Example:
```
Add session status indicators

- Add color-coded badges for session states
- Include animation for running state
- Update types for new status field

Fixes #42
```

### Pull Request Process

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure all tests pass
4. Update the README if adding new features
5. Submit a pull request with:
   - Clear title and description
   - Link to related issues
   - Screenshots for UI changes

## Testing

- Write tests for new features
- Ensure existing tests pass
- Test on multiple platforms if possible
- Manual testing checklist:
  - [ ] Create new session
  - [ ] Continue existing session
  - [ ] Git operations work correctly
  - [ ] Run scripts execute properly
  - [ ] UI is responsive

## Reporting Issues

When reporting issues, please include:
- Crystal version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Relevant error messages

## Feature Requests

We love hearing ideas for new features! When suggesting features:
- Explain the use case
- Describe the expected behavior
- Consider how it fits with existing features
- Be open to discussion and alternatives

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Public or private harassment
- Publishing others' private information
- Other unprofessional conduct

## Questions?

Feel free to:
- Open an issue for questions
- Join discussions in existing issues
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to Crystal! 🎉