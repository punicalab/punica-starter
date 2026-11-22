import { FormKit, PasswordField, TextField } from '@punica/form-kit';

@FormKit()
export class LoginForm {
  @TextField({
    label: 'Email',
    inputType: 'email',
    autocomplete: 'username',
    required: true,
    pattern: /^\S+@\S+\.\S+$/,
    messages: { pattern: () => 'Enter a valid email address' }
  })
  email = '';

  @PasswordField({ label: 'Password', autocomplete: 'current-password', required: true })
  password = '';
}
