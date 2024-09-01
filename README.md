# Docmap

Docmap is a powerful tool for managing documentation comments in source code. It:

1. Extracts specially-prefixed comments from various source files
2. Preserves original code structure while removing these comments
3. Generates a consolidated `README.md` with all extracted comments
4. Creates a sourcemap to trace comments back to their original locations

This approach mirrors how sourcemaps handle JavaScript transformations, providing a seamless way to maintain separate but linked documentation.

### Keeping Your Code Squeaky Clean

Here's the neat part: Docmap swoops in and plucks out those special comments from your source files, then bundles them all up in the README.
What does this mean for you? Your actual code stays nice and tidy, without all those extra comments cluttering things up. But don't worry, you're not losing any of that juicy
documentation – it's all safe and sound in the README. It's like having your cake and eating it too – clean code and thorough docs, all in one go!

## How it works

-   Extracts documentation comments from `.js`, `.ts`, `.jsx`, and `.tsx` source files.
-   Generates a consolidated `README.md` file with the extracted comments.
-   Creates a sourcemap that maps each comment in the `README.md` back to its original source code location.
-   Preserves the formatting and structure of the original source code.
-   Utilizes Babel, Prettier, and Mozilla's Source Map library for processing.

## Installation

To get started with `docmap`, you'll need to clone this repository and install the required dependencies:


## Usage

1. Mark comments for inclusion in the `README.md` using the specific prefix `#DOCMAP_v0.0.1:`. This prefix can be used in two ways:

   a. Block comments: Place these above the relevant code snippet.
      ```javascript
      /**
       * #DOCMAP_v0.0.1: This is a block comment
       */
      function exampleFunction() {
        // Function code here
      }
      ```

   b. Inline comments: Add these on the same line as the code they describe.
      ```javascript
      const result = someOperation(); // #DOCMAP_v0.0.1: This is an inline comment
      ```

   Docmap will extract these prefixed comments while preserving your code's structure and readability.

2.  **Run the Codemod**: Execute the script to process the source files, extract comments, and generate the `README.md` and sourcemap.
3.  **View the Output**: After running the script, you'll find:
    
    -   A `README.md` file with all extracted comments.
    -   A `README.map.json` file containing the sourcemap for those comments.


Example 1
```javascript
import { useReducer } from 'react';
/**
 * #DOCMAP_v0.0.1:
 * block comment2
 */
export default function TaskApp() {
  const [tasks, dispatch] = useReducer(
    tasksReducer,
    initialTasks
  );
  function handleAddTask(text) {
    dispatch({
      type: 'added',
      id: nextId++, // #DOCMAP_v0.0.1: inline comment
      text: text,
    });
  }
```

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

/**
 * #DOCMAP_v0.0.1: UserService class handles all user-related operations.
 * It's the backbone of our user management system, providing methods for
 * adding, retrieving, and updating user data. This abstraction layer
 * keeps our user data organized and easily accessible throughout the app.
 */
class UserService {
  private users: User[] = [];

  /**
   * #DOCMAP_v0.0.1: Adds a new user to the system. It's a simple method
   * that takes a User object and pushes it into our users array. No
   * validation here, but we might want to add some in the future.
   */
  addUser(user: User): void {
    this.users.push(user); // #DOCMAP_v0.0.1: Simple array push, no bells and whistles
  }

  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id); // #DOCMAP_v0.0.1: Returns User or undefined if not found
  }

  updateUser(id: number, updatedUser: Partial<User>): void {
    const index = this.users.findIndex(user => user.id === id);
    if (index !== -1) {
      this.users[index] = { ...this.users[index], ...updatedUser }; // #DOCMAP_v0.0.1: Merges existing user data with updates
    }
  }
}
```

## TODO:
- Multiple file support.
- convert to typescript


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue if you have any suggestions or find any bugs.