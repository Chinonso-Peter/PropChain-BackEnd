# Properties API Documentation

## Overview
The Properties API provides endpoints for managing real estate properties with advanced filtering, search, and pagination capabilities.

## Endpoints

### Get All Properties
```
GET /properties
```

#### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page` | number | Page number (default: 1) | `?page=1` |
| `limit` | number | Items per page (default: 20, max: 100) | `?limit=20` |
| `sortBy` | string | Field to sort by | `?sortBy=price` |
| `sortOrder` | string | Sort direction: 'asc' or 'desc' | `?sortOrder=asc` |
| `search` | string | Search in title, description, location | `?search=apartment` |
| `type` | string | Filter by property type | `?type=RESIDENTIAL` |
| `status` | string | Filter by status | `?status=AVAILABLE` |
| `city` | string | Filter by city | `?city=New%20York` |
| `country` | string | Filter by country | `?country=USA` |
| `minPrice` | number | Minimum price | `?minPrice=100000` |
| `maxPrice` | number | Maximum price | `?maxPrice=500000` |
| `minBedrooms` | number | Minimum bedrooms | `?minBedrooms=2` |
| `maxBedrooms` | number | Maximum bedrooms | `?maxBedrooms=5` |
| `minBathrooms` | number | Minimum bathrooms | `?minBathrooms=1` |
| `maxBathrooms` | number | Maximum bathrooms | `?maxBathrooms=3` |
| `minArea` | number | Minimum square footage | `?minArea=500` |
| `maxArea` | number | Maximum square footage | `?maxArea=5000` |
| `ownerId` | string | Filter by owner ID | `?ownerId=user_123` |

#### Property Types
- `RESIDENTIAL` - Residential properties
- `COMMERCIAL` - Commercial properties
- `INDUSTRIAL` - Industrial properties
- `LAND` - Land parcels

#### Property Status
- `AVAILABLE` - Available for sale/rent
- `PENDING` - Under contract
- `SOLD` - Sold
- `RENTED` - Rented

#### Example Requests

**Basic filtering:**
```
GET /properties?type=RESIDENTIAL&status=AVAILABLE
```

**Price range filter:**
```
GET /properties?minPrice=100000&maxPrice=500000
```

**Multiple filters:**
```
GET /properties?type=RESIDENTIAL&minBedrooms=2&maxBathrooms=3&minArea=1000
```

**Search with pagination:**
```
GET /properties?search=apartment&page=1&limit=10&sortBy=price&sortOrder=desc
```

**City and country combined:**
```
GET /properties?city=New%20York&country=USA
```

#### Response Format
```json
{
  "properties": [
    {
      "id": "prop_123",
      "title": "Luxury Downtown Apartment",
      "description": "Beautiful 2-bedroom apartment",
      "location": "New York, USA",
      "price": 500000,
      "status": "AVAILABLE",
      "propertyType": "RESIDENTIAL",
      "bedrooms": 2,
      "bathrooms": 2,
      "squareFootage": 1200,
      "ownerId": "user_123"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

### Get Property by ID
```
GET /properties/:id
```

### Create Property
```
POST /properties
```

### Update Property
```
PATCH /properties/:id
```

### Update Property Status
```
PATCH /properties/:id/status
```

### Delete Property
```
DELETE /properties/:id
```

### Get Properties by Owner
```
GET /properties/owner/:ownerId
```

### Get Property Statistics
```
GET /properties/statistics
```

### Search Nearby Properties
```
GET /properties/search/nearby?latitude=40.7128&longitude=-74.006&radiusKm=10
```

## Filtering Features

### Combined City and Country Filter
The city and country filters are combined into a single location search. For example:
- `?city=New York&country=USA` will search for properties with "New York, USA" in the location field

### Range Filters
All numeric filters support range queries:
- `minX` - Minimum value (inclusive)
- `maxX` - Maximum value (inclusive)

### Search
The search parameter performs case-insensitive matching across:
- Property title
- Property description
- Property location

## Error Handling

All endpoints return standard HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error
