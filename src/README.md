# Mergington High School Activities API

A super simple FastAPI application that allows students to view and sign up for extracurricular activities.

## Features

- View all available extracurricular activities
- View activity participants without logging in
- Allow teachers to sign up and unregister students after logging in

## Getting Started

1. Install the dependencies:

   ```
   pip install fastapi uvicorn
   ```

2. Set up a teacher account and session secret as described below.

3. Run the application:

   ```
   uvicorn src.app:app --reload
   ```

3. Open your browser and go to:
   - API documentation: http://localhost:8000/docs
   - Alternative documentation: http://localhost:8000/redoc

## API Endpoints

| Method | Endpoint                                                          | Description                                                         |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/auth/status`                                                    | Check whether the current browser has an active teacher session     |
| POST   | `/auth/login`                                                     | Log in with a configured teacher username and password              |
| POST   | `/auth/logout`                                                    | End the current teacher session                                     |
| GET    | `/activities`                                                     | Get all activities with their details and current participant count |
| POST   | `/activities/{activity_name}/signup?email=student@mergington.edu` | Sign up a student (teacher login required)                           |
| DELETE | `/activities/{activity_name}/unregister?email=student@mergington.edu` | Unregister a student (teacher login required)                    |

## Teacher access setup

Teacher passwords are stored as PBKDF2 hashes in a local JSON file. The file is ignored by Git so credentials are not committed.

1. Copy the example file:

   ```
   cp src/teachers.json.example src/teachers.json
   ```

2. Generate a password hash:

   ```
   python -c 'import getpass; from src.auth import hash_password; print(hash_password(getpass.getpass("Teacher password: ")))'
   ```

3. Add a teacher record to `src/teachers.json`:

   ```json
   {
     "teachers": [
       {
         "username": "teacher1",
         "password_hash": "paste-the-generated-hash-here"
       }
     ]
   }
   ```

4. Generate a session secret and set it in the environment. Keep the generated value private and do not commit it:

   ```
   python -c 'import secrets; print(secrets.token_urlsafe(32))'
   export SESSION_SECRET="paste-the-generated-value-here"
   ```

For HTTPS deployments, set `COOKIE_SECURE=true` so the teacher session cookie is sent only over HTTPS. Local HTTP development defaults this setting to false.

## Data Model

The application uses a simple data model with meaningful identifiers:

1. **Activities** - Uses activity name as identifier:

   - Description
   - Schedule
   - Maximum number of participants allowed
   - List of student emails who are signed up

2. **Students** - Uses email as identifier:
   - Name
   - Grade level

All data is stored in memory, which means data will be reset when the server restarts.
