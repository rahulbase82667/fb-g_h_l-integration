import pool from "../config/database.js";
import { loginFacebookAccount } from "../services/puppeteerLogin.js";

(async () => {
  const result = await loginFacebookAccount(1); // test with account ID 1
  console.log(result);
})();
