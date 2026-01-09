// utils/commonUtils.js

import mssql from "mssql";

export const getFieldValueString = async (
  pool,
  tableName,
  fieldName,
  condition
) => {
  try {
    const query = `SELECT ${fieldName} FROM ${tableName} ${condition}`;

    const result = await pool.request().query(query);

    // Return the first field value from the result set
    return result.recordset.length > 0 ? result.recordset[0][fieldName] : null;
  } catch (error) {
    console.error(
      `Error fetching field value from ${tableName}:`,
      error.message
    );
    throw new Error("Error fetching field value");
  }
};



// Common function to get a single numeric value from the database
export const getFieldValueNumeric = async (
  pool,
  tableName,
  fieldName,
  condition
) => {
  try {
    // Construct the SQL query
    const query = `SELECT ${fieldName} FROM ${tableName} ${condition}`;

    // Execute the query
    const result = await pool.request().query(query);
    console.log(result);
    // Return the numeric value if found
    if (
      result.recordset.length > 0 &&
      result.recordset[0][fieldName] !== null
    ) {
      return parseFloat(result.recordset[0][fieldName]);
    } else {
      throw new Error("Value not found or null");
    }
  } catch (error) {
    console.log(error);
    console.error("Error fetching numeric field value:", error.message);
    throw new Error("Database query failed: " + error.message);
  }
};




// Common function to execute parameterized queries
export const executeQuery = async (pool, query, params = []) => {
  try {
    // Prepare the request with parameter inputs
    const request = pool.request();
    params.forEach(({ name, type, value }) => {
      request.input(name, type, value);
    });

    // Execute the query
    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    console.error("Error executing query:", error.message);
    throw new Error("Database query failed: " + error.message);
  }
};

export const getNextID = async (tableName, pool) => {
  try {
    // Query to fetch the current ControlValue
    const selectQuery = `
      SELECT ControlValue 
      FROM IDControlManager 
      WHERE ControlName = @tableName
    `;

    const selectResult = await pool
      .request()
      .input("tableName", mssql.VarChar, tableName)
      .query(selectQuery);

    if (selectResult.recordset.length === 0) {
      // If no record exists, insert a new row with default values
      const insertQuery = `
        INSERT INTO IDControlManager (ControlName, ControlValue, ControlStep, CreatedOn, CreatedBy, ModifiedOn, ModifiedBy) 
        VALUES (@tableName, 1, '1', GETDATE(), 'System', GETDATE(), 'System')
      `;
      await pool
        .request()
        .input("tableName", mssql.VarChar, tableName)
        .query(insertQuery);
      return 1; // Return the first ID
    } else {
      // If a record exists, fetch the current value
      const currentValue = parseInt(selectResult.recordset[0].ControlValue, 10); // Ensure numeric value

      // Increment the ControlValue
      const newValue = currentValue + 1; // Proper numeric addition
      console.log("New Value:", newValue);

      const updateQuery = `
        UPDATE IDControlManager 
        SET ControlValue = @newValue, ModifiedOn = GETDATE(), ModifiedBy = 'System'
        WHERE ControlName = @tableName
      `;
      await pool
        .request()
        .input("tableName", mssql.VarChar, tableName)
        .input("newValue", mssql.BigInt, newValue)
        .query(updateQuery);

      return newValue; // Return the incremented value
    }
  } catch (error) {
    console.error("Error in getNextID:", error.message);
    throw new Error("Error generating next ID");
  }
};

export const getNextFieldValue = async (
  pool,
  tableName,
  fieldName,
  condition = ""
) => {
  try {
    // Construct the SQL query to get the max value
    const query = `SELECT MAX(CONVERT(BIGINT, ${fieldName})) AS MaxValue FROM ${tableName} ${condition}`;

    // Execute the query using the provided connection pool
    const result = await pool.request().query(query);
    console.log("Result:", result);

    // Extract the max value from the result set
    const maxValue =
      result.recordset.length > 0 && result.recordset[0].MaxValue !== null
        ? parseInt(result.recordset[0].MaxValue, 10)
        : 0;

    // Log the maximum value fetched
    console.log(`Maximum value for ${fieldName} in ${tableName}:`, maxValue);

    // Calculate the next ID by adding 1
    const nextValue = maxValue + 1;

    // Return the next available ID
    return nextValue;
  } catch (error) {
    console.error("Error in getNextFieldValue:", error.message);
    throw new Error("Database query failed: " + error.message);
  }
};

export const checkExistence = async (
  tableName,
  fieldName,
  fieldValue,
  pool,
  additionalCondition = ""
) => {
  try {
    // Construct the SQL query dynamically
    const query = `
      SELECT 1 AS RowExists
      FROM ${tableName}
      WHERE ${fieldName} = @fieldValue
      ${additionalCondition}
    `;

    // Log the query for debugging (optional)
    console.log("Executing query:", query);

    // Execute the query
    const result = await pool
      .request()
      .input("fieldValue", mssql.VarChar, fieldValue)
      .query(query);

    // Return true if any rows are found, false otherwise
    return result.recordset.length > 0;
  } catch (error) {
    console.error("Error in checkExistence:", error.message);
    throw new Error("Database query failed");
  }
};

// Common function for handling errors in controllers
export const handleErrorResponse = (res, error, message) => {
  console.error(message, error.message);
  res.status(500).json({ error: message });
};


export const getFieldValueNumericFromDS = (dataset, fieldValue, conditions) => {
  if (!dataset || !dataset.recordset || !Array.isArray(dataset.recordset) || dataset.recordset.length === 0) {
    return 0;
  }

  // Apply multiple conditions
  const matchedRow = dataset.recordset.find(row =>
    Object.entries(conditions).every(([key, value]) => row[key] === value)
  );

  return matchedRow && matchedRow[fieldValue] !== undefined
    ? parseFloat(matchedRow[fieldValue]) || 0
    : 0;
};

  
export const getServerDate = async (pool) => {
  try {
    const result = await pool.request().query("SELECT CAST(GETDATE() AS DATE) AS ServerDate");
    return result.recordset.length > 0 ? result.recordset[0].ServerDate : null;
  } catch (error) {
    console.error("Error in getServerDate:", error.message);
    throw new Error("Database query failed");
  }
};

export const getServerDateTime = async (pool) => {
  try {
    const result = await pool.request().query("SELECT GETDATE() AS ServerDateTime");
    return result.recordset.length > 0 ? result.recordset[0].ServerDateTime : null;
  } catch (error) {
    console.error("Error in getServerDateTime:", error.message);
    throw new Error("Database query failed");
  }
};